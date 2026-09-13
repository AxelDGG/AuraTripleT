// Voz: STT y TTS via ElevenLabs (/api/voice/*).
// Fallback a Web Speech API si ElevenLabs no está disponible o falla.
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let currentRecognition = null;
  let currentRecorder = null;
  let currentAudio = null;

  // Corte por silencio: la grabación se cierra sola cuando el usuario deja de hablar.
  const SILENCE_MS = 1100;     // silencio continuo que da por terminada la frase
  const NO_SPEECH_MS = 7000;   // si nunca se detecta voz, corta igual
  const MAX_MS = 30000;        // tope duro de grabación
  const CALIBRATE_MS = 350;    // ventana inicial para medir el ruido ambiente
  const MIN_RMS = 0.015;       // piso mínimo para considerar que hay voz
  const TICK_MS = 60;          // cada cuánto se mide el nivel

  function isSupported() {
    return Boolean(Recognition) || Boolean(navigator.mediaDevices?.getUserMedia);
  }

  function errorKey(code) {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed': return 'voice.denied';
      case 'no-speech': return 'voice.noSpeech';
      case 'audio-capture': return 'voice.noMic';
      case 'network': return 'voice.network';
      case 'unsupported': return 'voice.unsupported';
      default: return 'voice.error';
    }
  }

  // --- STT: Web Speech API (fallback) ---

  function listenWebSpeech({ lang, onInterim, onResult, onEnd, onError }) {
    if (!Recognition) { onError?.('unsupported'); onEnd?.(); return null; }
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let finalText = '';
    let failed = false;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (ev) => { failed = true; onError?.(ev.error || 'error'); };
    rec.onend = () => {
      currentRecognition = null;
      if (!failed && finalText.trim()) onResult?.(finalText.trim());
      onEnd?.();
    };
    try {
      rec.start();
      currentRecognition = rec;
    } catch {
      onError?.('start-failed');
      onEnd?.();
      return null;
    }
    return rec;
  }

  // Expuesto para compatibilidad con código externo que llame a Voice.listen directamente.
  function listen(opts) { return listenWebSpeech(opts); }

  // --- STT: ElevenLabs via /api/voice/transcribe ---

  async function elabsTranscribe(audioBlob) {
    const res = await fetch('/api/voice/transcribe', {
      method: 'POST',
      headers: window.Session.headers({ 'Content-Type': audioBlob.type || 'audio/webm' }),
      body: audioBlob,
    });
    if (!res.ok) throw new Error(`transcribe ${res.status}`);
    const { text } = await res.json();
    return text ?? '';
  }

  // --- TTS: ElevenLabs via /api/voice/speak ---

  async function elabsSpeak(text) {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: window.Session.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`speak ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
    audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; };
    await audio.play();
  }

  // --- TTS: Web Speech Synthesis (fallback) ---

  function synthSpeak(text, lang) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 600));
    utterance.lang = lang;
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  // --- stop / silence ---

  function stop() {
    if (currentRecognition) {
      try { currentRecognition.stop(); } catch { /* ya detenido */ }
      currentRecognition = null;
    }
    if (currentRecorder && currentRecorder.state !== 'inactive') {
      currentRecorder.stop();
    }
  }

  function silence() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  }

  // --- VAD: mide el nivel del micro y avisa cuando la frase terminó ---

  // Calibra el ruido ambiente los primeros CALIBRATE_MS y a partir de ahí
  // considera "voz" todo lo que supere ese piso. Llama a onIdle con el motivo
  // ('silence' | 'no-speech' | 'max') y se desmonta solo. Devuelve su teardown.
  function watchSilence(stream, { onIdle }) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return () => {};

    let ctx;
    try { ctx = new Ctx(); } catch { return () => {}; }
    ctx.resume?.().catch(() => {});

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    let floor = 0;
    let floorSamples = 0;
    let lastVoiceAt = 0;
    let hasSpoken = false;
    let timer = 0;
    let done = false;

    function teardown() {
      if (done) return;
      done = true;
      clearInterval(timer);
      try { source.disconnect(); } catch { /* ya desconectado */ }
      ctx.close?.().catch(() => {});
    }

    function finish(reason) {
      if (done) return;
      teardown();
      onIdle(reason);
    }

    function level() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    }

    timer = setInterval(() => {
      if (done) return;
      const rms = level();
      const now = performance.now();
      const elapsed = now - startedAt;

      // Ventana de calibración: solo promedia el ruido de fondo.
      if (elapsed < CALIBRATE_MS) {
        floor = (floor * floorSamples + rms) / (floorSamples + 1);
        floorSamples++;
        return;
      }

      if (rms > Math.max(MIN_RMS, floor * 2.5)) {
        hasSpoken = true;
        lastVoiceAt = now;
      }

      if (elapsed > MAX_MS) finish('max');
      else if (!hasSpoken) { if (elapsed > NO_SPEECH_MS) finish('no-speech'); }
      else if (now - lastVoiceAt > SILENCE_MS) finish('silence');
    }, TICK_MS);

    return teardown;
  }

  // --- dictate: graba con MediaRecorder → ElevenLabs STT, fallback a Web Speech ---

  function dictate({ input, button, onResult }) {
    const { t, locale } = window.I18N;

    if (currentRecognition || currentRecorder) { stop(); return; }

    const prevPlaceholder = input.placeholder;
    const prevValue = input.value;

    function setListening(on) {
      button.classList.toggle('is-listening', on);
      button.setAttribute('aria-pressed', String(on));
      input.placeholder = on ? t('voice.listening') : prevPlaceholder;
    }

    function fallbackToWebSpeech() {
      if (!Recognition) {
        window.UI.toast(t('voice.unsupported'), 'error');
        setListening(false);
        return;
      }
      listenWebSpeech({
        lang: locale(),
        onInterim: (text) => { input.value = text; },
        onResult: (text) => { onResult(text); },
        onError: (code) => {
          input.value = prevValue;
          window.UI.toast(t(errorKey(code)), code === 'no-speech' ? 'info' : 'error');
        },
        onEnd: () => setListening(false),
      });
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setListening(true);
      fallbackToWebSpeech();
      return;
    }

    setListening(true);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      currentRecorder = recorder;

      let stopWatch = () => {};
      let silent = false;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stopWatch();
        stream.getTracks().forEach((tr) => tr.stop());
        currentRecorder = null;
        setListening(false);
        // Nadie habló: no gastamos una llamada de STT en audio vacío.
        if (silent) { window.UI.toast(t('voice.noSpeech'), 'info'); return; }
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        try {
          const text = await elabsTranscribe(blob);
          if (text?.trim()) onResult(text.trim());
        } catch {
          window.UI.toast(t('voice.error'), 'error');
        }
      };

      recorder.start();

      // A partir de aquí la grabación se cierra sola al detectar el final de la frase.
      stopWatch = watchSilence(stream, {
        onIdle: (reason) => {
          silent = reason === 'no-speech';
          if (recorder.state !== 'inactive') recorder.stop();
        },
      });
    }).catch(() => {
      fallbackToWebSpeech();
    });
  }

  // --- speak: ElevenLabs TTS, fallback a Web Speech Synthesis ---

  async function speak(text, lang) {
    if (!text) return;
    silence();
    try {
      await elabsSpeak(String(text).slice(0, 1000));
    } catch {
      synthSpeak(text, lang);
    }
  }

  window.Voice = {
    isSupported,
    listen,
    dictate,
    stop,
    speak,
    silence,
    errorKey,
    get isListening() { return Boolean(currentRecognition || currentRecorder); },
  };
})();

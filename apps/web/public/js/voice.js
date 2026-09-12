// Voz: STT y TTS via ElevenLabs (/api/voice/*).
// Fallback a Web Speech API si ElevenLabs no está disponible o falla.
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let currentRecognition = null;
  let currentRecorder = null;
  let currentAudio = null;

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

<<<<<<< HEAD
  // Expuesto para compatibilidad con código externo que llame a Voice.listen directamente.
  function listen(opts) { return listenWebSpeech(opts); }

  // --- STT: ElevenLabs via /api/voice/transcribe ---

  async function elabsTranscribe(audioBlob) {
    const res = await fetch('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
=======
  // Dictado integrado a un input: muestra la transcripción mientras hablas y
  // entrega el texto final. Un segundo clic detiene la escucha.
  function dictate({ input, button, onResult }) {
    const { t, locale } = window.I18N;
    if (current) { stop(); return; }
    if (!Recognition) { window.UI.toast(t('voice.unsupported'), 'error'); return; }
    const previousPlaceholder = input.placeholder;
    const previousValue = input.value;
    button.classList.add('is-listening');
    button.setAttribute('aria-pressed', 'true');
    input.placeholder = t('voice.listening');
    listen({
      lang: locale(),
      onInterim: (text) => { input.value = text; },
      onResult: (text) => { onResult(text); },
      onError: (code) => {
        input.value = previousValue;
        window.UI.toast(t(errorKey(code)), code === 'no-speech' ? 'info' : 'error');
      },
      onEnd: () => {
        button.classList.remove('is-listening');
        button.setAttribute('aria-pressed', 'false');
        input.placeholder = previousPlaceholder;
      },
>>>>>>> origin/main
    });
    if (!res.ok) throw new Error(`transcribe ${res.status}`);
    const { text } = await res.json();
    return text ?? '';
  }

  // --- TTS: ElevenLabs via /api/voice/speak ---

  async function elabsSpeak(text) {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // --- dictate: graba con MediaRecorder → ElevenLabs STT, fallback a Web Speech ---

  function dictate({ input, button, onResult }) {
    const { t, locale } = window.I18N;

    if (currentRecognition || currentRecorder) { stop(); return; }

    const prevPlaceholder = input.placeholder;
    const prevValue = input.value;

    function setListening(on) {
      button.classList.toggle('is-listening', on);
      button.setAttribute('aria-pressed', String(on));
      input.placeholder = on ? t('ask.listening') : prevPlaceholder;
    }

    function fallbackToWebSpeech() {
      if (!Recognition) {
        window.Modals.toast(t('voice.unsupported'), 'error');
        setListening(false);
        return;
      }
      listenWebSpeech({
        lang: locale(),
        onInterim: (text) => { input.value = text; },
        onResult: (text) => { onResult(text); },
        onError: (code) => {
          input.value = prevValue;
          window.Modals.toast(t(errorKey(code)), code === 'no-speech' ? 'info' : 'error');
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

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        currentRecorder = null;
        setListening(false);
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        try {
          const text = await elabsTranscribe(blob);
          if (text?.trim()) onResult(text.trim());
        } catch {
          window.Modals.toast(t('voice.error'), 'error');
        }
      };

      recorder.start();
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

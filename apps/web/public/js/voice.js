// Voz: dictado (Web Speech API) con transcripción en vivo y lectura de respuestas.
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let current = null;

  function isSupported() { return Boolean(Recognition); }

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

  function stop() {
    if (!current) return;
    try { current.stop(); } catch { /* ya detenido */ }
    current = null;
  }

  function listen({ lang, onInterim, onResult, onEnd, onError }) {
    if (!Recognition) { onError?.('unsupported'); onEnd?.(); return null; }
    stop();
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
      current = null;
      if (!failed && finalText.trim()) onResult?.(finalText.trim());
      onEnd?.();
    };
    try {
      rec.start();
      current = rec;
    } catch {
      onError?.('start-failed');
      onEnd?.();
      return null;
    }
    return rec;
  }

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
    });
  }

  function speak(text, lang) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 600));
    utterance.lang = lang;
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  function silence() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  window.Voice = { isSupported, listen, dictate, stop, speak, silence, errorKey, get isListening() { return Boolean(current); } };
})();

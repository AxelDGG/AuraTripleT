// Panel lateral de Norte AI: conversación + interfaces generativas vía SSE.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { open: false, busy: false, history: [], healthChecked: false };
  const HISTORY_LIMIT = 12;
  const CHIPS = [
    ['ai.chip.insights', 'prompt.insights'],
    ['ai.chip.spending', 'prompt.spending'],
    ['ai.chip.transfer', 'prompt.transfer'],
    ['ai.chip.credit', 'prompt.credit'],
    ['ai.chip.fx', 'prompt.fx'],
    ['ai.chip.card', 'prompt.card'],
  ];

  function scrollBottom() {
    const body = $('aiBody');
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  function renderEmpty() {
    const { t } = window.I18N;
    const body = $('aiBody');
    body.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'ai-empty';
    empty.innerHTML = `<div class="ai-orb" style="margin:0 auto 12px;width:52px;height:52px">${window.ICONS.icon('sparkle')}</div><h3></h3><p></p><div class="ai-chips"></div>`;
    empty.querySelector('h3').textContent = t('ai.empty.title');
    empty.querySelector('p').textContent = t('ai.empty.text');
    const chips = empty.querySelector('.ai-chips');
    for (const [label, prompt] of CHIPS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pill';
      chip.textContent = t(label);
      chip.addEventListener('click', () => send(t(prompt)));
      chips.append(chip);
    }
    body.append(empty);
  }

  function addBubble(role, text) {
    const body = $('aiBody');
    body.querySelector('.ai-empty')?.remove();
    const msg = document.createElement('div');
    msg.className = `ai-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    msg.append(bubble);
    body.append(msg);
    scrollBottom();
    return { msg, bubble };
  }

  function addThinking() {
    const { t } = window.I18N;
    const { msg, bubble } = addBubble('agent', '');
    msg.classList.add('thinking');
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    const label = document.createElement('span');
    label.textContent = t('ai.thinking');
    bubble.replaceChildren(spinner, label);
    return { msg, bubble, label };
  }

  function statusText() {
    const { t } = window.I18N;
    if (state.offline) return 'offline';
    return state.model ? `${t('ai.ready')} · ${state.model}` : t('ai.ready');
  }

  function setBusy(value) {
    const { t } = window.I18N;
    state.busy = value;
    $('aiSend').disabled = value;
    $('aiInput').disabled = value;
    $('aiOrb').classList.toggle('is-busy', value);
    $('aiStatus').textContent = value ? t('ai.busy') : statusText();
    if (!value) $('aiInput').focus();
  }

  async function send(text, displayText, { fromVoice = false } = {}) {
    const { t } = window.I18N;
    if (state.busy || !text?.trim()) return;
    if (!state.open) open();
    window.Voice?.silence();
    const speakReply = fromVoice && window.Modals.settings.voice !== false;
    setBusy(true);
    addBubble('user', displayText ?? text);
    const thinking = addThinking();
    const toolsSeen = [];
    let finalMessage = null;
    let genContainer = null;

    try {
      await window.API.streamChat({
        message: text,
        history: state.history,
        onEvent: (event) => {
          switch (event.type) {
            case 'status':
              thinking.label.textContent = event.text;
              break;
            case 'tool_call':
              toolsSeen.push(event.name);
              thinking.label.textContent = t('ai.tool', { tool: event.name });
              break;
            case 'ui':
              finalMessage = event.message || t('ai.done');
              genContainer = document.createElement('div');
              genContainer.className = 'ai-gen';
              window.renderGeneratedUi(genContainer, event.ui);
              if (speakReply) window.Voice?.speak(finalMessage, window.I18N.locale());
              break;
            case 'error':
              finalMessage = event.text;
              break;
            default:
              break;
          }
          scrollBottom();
        },
      });
      thinking.msg.classList.remove('thinking');
      thinking.bubble.replaceChildren();
      thinking.bubble.textContent = finalMessage ?? t('ai.noResponse');
      if (toolsSeen.length) {
        const line = document.createElement('div');
        line.className = 'tool-line';
        for (const name of new Set(toolsSeen)) {
          const chip = document.createElement('span');
          chip.textContent = `⚙ ${name}`;
          line.append(chip);
        }
        thinking.bubble.append(line);
      }
      if (genContainer) $('aiBody').append(genContainer);
      state.history.push({ role: 'user', content: text }, { role: 'assistant', content: finalMessage ?? '' });
      if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
    } catch (err) {
      thinking.msg.classList.remove('thinking');
      thinking.bubble.textContent = err.name === 'AbortError' ? t('ai.timeout') : t('ai.error', { msg: err.message });
    } finally {
      setBusy(false);
      scrollBottom();
    }
  }

  async function checkHealth() {
    if (state.healthChecked) return;
    state.healthChecked = true;
    try {
      const h = await window.API.fetchHealth();
      state.model = h.model;
      state.offline = false;
    } catch {
      state.offline = true;
    }
    if (!state.busy) $('aiStatus').textContent = statusText();
  }

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

  // Mantiene el foco dentro del panel mientras está abierto (Tab / Shift+Tab).
  function trapFocus(e) {
    if (e.key !== 'Tab' || !state.open) return;
    const items = [...$('aiPanel').querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(prompt, options = {}) {
    if (!state.open) state.returnFocus = document.activeElement;
    state.open = true;
    const panel = $('aiPanel');
    panel.inert = false;
    panel.classList.add('is-open');
    $('aiScrim').classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    checkHealth();
    if (!$('aiBody').children.length) renderEmpty();
    if (prompt) send(prompt, undefined, options);
    else setTimeout(() => $('aiInput').focus(), 300);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    const panel = $('aiPanel');
    panel.classList.remove('is-open');
    $('aiScrim').classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    window.Voice?.stop();
    window.Voice?.silence();
    if (state.returnFocus?.focus) state.returnFocus.focus();
  }

  function rerenderTexts() {
    window.I18N.apply($('aiPanel'));
    if ($('aiBody').querySelector('.ai-empty')) renderEmpty();
    if (!state.busy) $('aiStatus').textContent = statusText();
  }

  function init() {
    $('aiPanel').inert = true;
    $('aiPanel').addEventListener('keydown', trapFocus);
    $('aiForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('aiInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      send(text);
    });
    $('aiClose').addEventListener('click', close);
    $('aiScrim').addEventListener('click', close);
    $('aiMic').addEventListener('click', () => {
      window.Voice.dictate({
        input: $('aiInput'),
        button: $('aiMic'),
        onResult: (text) => { $('aiInput').value = ''; send(text, undefined, { fromVoice: true }); },
      });
    });
    window.addEventListener('genui:form-submit', (e) => {
      const { action, payload } = e.detail;
      send(`[form:${action}] ${payload}`, window.I18N.t('ai.formSent', { payload }));
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) close(); });
  }

  window.AIPanel = { init, open, close, send, rerenderTexts, get isOpen() { return state.open; } };
})();

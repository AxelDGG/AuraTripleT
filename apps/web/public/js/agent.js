// Conversación con el agente: manda el prompt, consume el stream SSE y pinta la
// interfaz generada en el lienzo. Cuando la API confirma que la archivó (evento
// `history`), la tarjeta entra al carrusel y a su carpeta.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  const HISTORY_LIMIT = 12;
  const CHIPS = [
    ['chip.spending', 'prompt.spending'],
    ['chip.accounts', 'prompt.accounts'],
    ['chip.transfer', 'prompt.transfer'],
    ['chip.credit', 'prompt.credit'],
    ['chip.card', 'prompt.card'],
    ['chip.fx', 'prompt.fx'],
  ];

  const state = { busy: false, offline: false, model: null, history: [] };

  // ---------- Estado en la franja superior ----------

  function setStatus(key, vars) {
    const node = $('agentState');
    node.textContent = window.I18N.t(key, vars);
    node.classList.toggle('is-busy', key === 'state.busy');
    node.classList.toggle('is-offline', key === 'state.offline');
  }

  function setBusy(value) {
    state.busy = value;
    $('composerInput').disabled = value;
    $('composerSend').disabled = value;
    if (value) setStatus('state.busy');
    else setStatus(state.offline ? 'state.offline' : 'state.ready');
    if (!value) $('composerInput').focus();
  }

  // ---------- Lienzo ----------

  function renderEmpty() {
    const { t } = window.I18N;
    const canvas = $('canvas');
    const empty = el('div', 'canvas-empty');
    const orb = el('div', 'orb');
    orb.append(window.ICONS.el('sparkle'));
    empty.append(orb, el('h2', null, t('canvas.title')), el('p', null, t('canvas.text')));
    const chips = el('div', 'chips');
    for (const [label, prompt] of CHIPS) {
      const chip = el('button', 'chip', t(label));
      chip.type = 'button';
      chip.addEventListener('click', () => send(t(prompt)));
      chips.append(chip);
    }
    empty.append(chips);
    canvas.replaceChildren(empty);
  }

  function renderThinking() {
    const canvas = $('canvas');
    const box = el('div', 'thinking');
    box.append(el('span', 'spinner'));
    const label = el('span', 'label', window.I18N.t('agent.thinking'));
    const tools = el('div', 'tools');
    box.append(label, tools);
    canvas.replaceChildren(box);
    return { label, tools };
  }

  // Cabecera + componentes de una visualización, sea recién generada o traída
  // del historial.
  function renderSpec({ title, folder, message, ui, when }) {
    const canvas = $('canvas');
    canvas.replaceChildren();

    const head = el('div', 'canvas-head');
    const main = el('div');
    main.append(el('h2', null, title ?? ''));
    if (message) main.append(el('p', null, message));
    head.append(main);

    const meta = el('div', 'canvas-meta');
    if (folder) meta.append(el('span', 'folder-chip', window.History.folderLabel(folder)));
    if (when) meta.append(el('span', 'muted', window.I18N.fmtWhen(when)));
    head.append(meta);
    canvas.append(head);

    const stack = el('div', 'gen-stack');
    window.renderGeneratedUi(stack, ui ?? []);
    canvas.append(stack);
    canvas.scrollTop = 0;
  }

  function showEntry(entry) {
    renderSpec({
      title: entry.title,
      folder: entry.folder,
      message: entry.message ?? entry.spec?.message,
      ui: entry.spec?.ui,
      when: entry.createdAt,
    });
  }

  // ---------- Envío ----------

  async function send(text, { fromVoice = false } = {}) {
    const { t } = window.I18N;
    const prompt = String(text ?? '').trim();
    if (state.busy || !prompt) return;

    window.Voice?.silence();
    setBusy(true);
    const thinking = renderThinking();
    window.History.setLive(true, prompt);

    const toolsSeen = new Set();
    let generated = null;

    try {
      await window.API.streamChat({
        message: prompt,
        history: state.history,
        onEvent: (event) => {
          switch (event.type) {
            case 'status':
              thinking.label.textContent = event.text;
              break;
            case 'tool_call':
              if (!toolsSeen.has(event.name)) {
                toolsSeen.add(event.name);
                thinking.tools.append(el('span', null, `⚙ ${event.name}`));
              }
              thinking.label.textContent = t('agent.tool', { tool: event.name });
              break;
            case 'ui':
              generated = event;
              renderSpec({ title: event.title, folder: event.folder, message: event.message, ui: event.ui });
              if (fromVoice) window.Voice?.speak(event.message, window.I18N.locale());
              break;
            case 'history':
              // La API ya la guardó en Tiger: entra al carrusel y a su carpeta.
              window.History.setLive(false);
              window.History.add(event.entry);
              window.UI.toast(t('agent.saved', { folder: window.History.folderLabel(event.entry.folder) }), 'success');
              break;
            case 'error':
              window.UI.toast(event.text, 'error');
              break;
            default:
              break;
          }
        },
      });

      if (!generated) {
        window.UI.toast(t('agent.noResponse'), 'error');
        renderEmpty();
      } else {
        state.history.push({ role: 'user', content: prompt }, { role: 'assistant', content: generated.message ?? '' });
        if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
      }
    } catch (err) {
      const message = err.name === 'AbortError' ? t('agent.timeout') : t('agent.error', { msg: err.message });
      window.UI.toast(message, 'error');
      if (!generated) renderEmpty();
    } finally {
      window.History.setLive(false);
      setBusy(false);
    }
  }

  async function checkHealth() {
    try {
      const health = await window.API.fetchHealth();
      state.model = health.model;
      state.offline = false;
      setStatus('state.ready');
    } catch {
      state.offline = true;
      setStatus('state.offline');
    }
  }

  function init() {
    renderEmpty();
    setStatus('state.connecting');
    checkHealth();

    $('composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('composerInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      send(text);
    });

    $('micBtn').addEventListener('click', () => {
      window.Voice.dictate({
        input: $('composerInput'),
        button: $('micBtn'),
        onResult: (text) => { $('composerInput').value = ''; send(text, { fromVoice: true }); },
      });
    });

    // Los formularios que genera el agente (transferencias, simulaciones) se
    // devuelven como un mensaje más del mismo turno.
    window.addEventListener('genui:form-submit', (e) => {
      const { action, payload } = e.detail;
      send(`[form:${action}] ${payload}`);
    });
  }

  window.Agent = { init, send, showEntry, renderEmpty, get isBusy() { return state.busy; } };
})();

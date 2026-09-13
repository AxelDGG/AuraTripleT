// Conversación con el agente: manda el prompt, consume el stream SSE y pinta la
// interfaz generada en el lienzo. Cuando la API confirma que la archivó (evento
// `history`), la entrada aparece en la línea de tiempo del riel y en su carpeta.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  const HISTORY_LIMIT = 12;

  const state = { busy: false, offline: false, model: null, history: [], threadEntryId: null };

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

  function setHasContent(on) {
    document.querySelector('.workspace')?.classList.toggle('has-content', on);
  }

  function ensureComposerInWorkspace() {
    const composer = $('composer');
    const workspace = document.querySelector('.workspace');
    if (composer && workspace && composer.parentElement !== workspace) {
      workspace.append(composer);
    }
  }

  function renderEmpty() {
    const { t } = window.I18N;
    const canvas = $('canvas');
    const composer = $('composer');
    const workspace = document.querySelector('.workspace');

    // Si el composer estaba dentro del canvas (estado vacío anterior), extráelo antes
    // de limpiar el canvas para no perder el elemento del DOM.
    if (composer && composer.closest('#canvas')) workspace?.append(composer);

    const empty = el('div', 'canvas-empty');
    const orb = el('div', 'orb');
    orb.append(window.ICONS.el('sparkle'));

    const rawName = $('customerName')?.textContent ?? '';
    const firstName = (rawName && rawName !== '…' && rawName !== 'Banca en línea')
      ? rawName.split(' ')[0] : '';
    const title = firstName ? `¿Qué quieres ver hoy, ${firstName}?` : t('canvas.title');

    empty.append(orb, el('h2', null, title), el('p', null, t('canvas.text')));

    // Botón de info (reemplaza el hint card siempre visible)
    const infoBtn = el('button', 'help-btn canvas-info-btn');
    infoBtn.type = 'button';
    infoBtn.dataset.help = 'canvas';
    infoBtn.setAttribute('aria-label', 'Cómo empezar');
    infoBtn.append(window.ICONS.el('alertInfo'));
    empty.append(infoBtn);

    // Mueve el composer al centro, justo bajo el saludo (estilo Claude)
    if (composer) empty.append(composer);

    canvas.replaceChildren(empty);
    setHasContent(false);
    state.threadEntryId = null;
    state.isInThread = false;
  }

  function renderThinking(prompt) {
    ensureComposerInWorkspace();
    const canvas = $('canvas');
    canvas.querySelector('.thinking')?.remove();
    if (!state.isInThread) {
      // Hilo nuevo: limpiar contenido anterior antes del spinner
      canvas.replaceChildren();
    } else if (prompt) {
      canvas.append(el('div', 'conv-question', prompt));
    }
    const box = el('div', 'thinking');
    box.append(el('span', 'spinner'));
    const label = el('span', 'label', window.I18N.t('agent.thinking'));
    const tools = el('div', 'tools');
    box.append(label, tools);
    canvas.append(box);
    canvas.scrollTop = canvas.scrollHeight;
    return { label, tools };
  }

  // En primer turno reemplaza el canvas; en hilo apila el nuevo turno.
  function renderSpec({ title, folder, message, ui, when }) {
    const canvas = $('canvas');
    canvas.querySelector('.thinking')?.remove();

    if (!state.isInThread) canvas.replaceChildren();

    const turn = el('div', 'conv-turn');

    const head = el('div', 'canvas-head');
    const main = el('div');
    main.append(el('h2', null, title ?? ''));
    if (message) main.append(el('p', null, message));
    head.append(main);

    const meta = el('div', 'canvas-meta');
    if (folder) meta.append(el('span', 'folder-chip', window.History.folderLabel(folder)));
    if (when) meta.append(el('span', 'muted', window.I18N.fmtWhen(when)));
    const expand = el('button', 'canvas-expand');
    expand.type = 'button';
    expand.title = window.I18N.t('canvas.expand');
    expand.setAttribute('aria-label', window.I18N.t('canvas.expand'));
    expand.append(window.ICONS.el('expand'));
    expand.addEventListener('click', () => window.UI.openOverlay({
      title,
      folderLabel: folder ? window.History.folderLabel(folder) : '',
      meta: when ? window.I18N.fmtDateTime(when) : (message ?? ''),
      spec: { ui: ui ?? [] },
    }));
    meta.append(expand);
    head.append(meta);
    turn.append(head);

    const stack = el('div', 'gen-stack');
    window.renderGeneratedUi(stack, ui ?? []);
    turn.append(stack);
    canvas.append(turn);

    if (state.isInThread) {
      canvas.scrollTop = canvas.scrollHeight;
    } else {
      canvas.scrollTop = 0;
      state.isInThread = true;
    }
    setHasContent(true);
  }

  function showEntry(entry) {
    // Abrir un item del historial siempre arranca una vista limpia;
    // el threadEntryId apunta a ese item para que los follow-ups lo actualicen.
    state.isInThread = false;
    state.threadEntryId = entry.id ?? null;
    state.history = [];
    renderSpec({
      title: entry.title,
      folder: entry.folder,
      message: entry.message ?? entry.spec?.message,
      ui: entry.spec?.ui,
      when: entry.createdAt,
    });
  }

  // ---------- Envío ----------

  async function send(text, { fromVoice = false, newThread = false } = {}) {
    const { t } = window.I18N;
    const prompt = String(text ?? '').trim();
    if (state.busy || !prompt) return;

    // Visualización nueva: descarta el hilo y contexto anteriores
    if (newThread) {
      state.threadEntryId = null;
      state.isInThread = false;
      state.history = [];
    }

    window.Voice?.silence();
    setBusy(true);
    const thinking = renderThinking(prompt);
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
                const chip = el('span', 'tool-chip');
                chip.appendChild(window.ICONS.el('gear'));
                chip.appendChild(el('span', null, event.name));
                thinking.tools.append(chip);
              }
              thinking.label.textContent = t('agent.tool', { tool: event.name });
              break;
            case 'ui':
              generated = event;
              renderSpec({ title: event.title, folder: event.folder, message: event.message, ui: event.ui });
              if (fromVoice) window.Voice?.speak(event.message, window.I18N.locale());
              break;
            case 'history':
              window.History.setLive(false);
              if (state.threadEntryId) {
                state.threadEntryId = window.History.updateEntry(state.threadEntryId, event.entry);
              } else {
                window.History.add(event.entry);
                state.threadEntryId = event.entry.id;
                window.UI.toast(t('agent.saved', { folder: window.History.folderLabel(event.entry.folder) }), 'success');
              }
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

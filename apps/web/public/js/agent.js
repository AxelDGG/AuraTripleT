// Conversación con el agente: manda el prompt, consume el stream SSE y pinta la
// interfaz generada en el lienzo. Cuando la API confirma que la archivó (evento
// `history`), la entrada aparece en la línea de tiempo del riel y en su carpeta.
//
// Norte A2UI v2: los mensajes del protocolo llegan en eventos `a2ui` y se
// aplican al store compartido; el renderer (js/a2ui-web.js) está suscrito y
// pinta cada cambio en su lugar. El lienzo empieza a existir con el esqueleto
// (primer createSurface) y se completa chunk a chunk. Las acciones de la UI
// generada (botones, formularios) salen por POST /api/action con el contexto
// resuelto, y la superficie activa viaja en cada petición para que el agente
// pueda responder con un patch en vez de reconstruir la pantalla.
//
// Hilos: la primera visualización reemplaza el lienzo; las preguntas de
// seguimiento se apilan debajo (pregunta + turno) y actualizan la misma entrada
// del historial en vez de crear otra. Una sugerencia arranca un hilo nuevo.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  const HISTORY_LIMIT = 12;

  const state = {
    busy: false,
    offline: false,
    model: null,
    history: [],
    // Superficie que la persona tiene en pantalla: { surfaceId, title }.
    active: null,
    // Montaje, cabecera y contenedor del turno más reciente.
    mount: null,
    head: null,
    turn: null,
    // Todos los montajes vivos en el lienzo: en un hilo los turnos anteriores
    // siguen suscritos al store para que sus gráficas no mueran.
    mounts: [],
    // Entrada del historial que el hilo actual va actualizando.
    threadEntryId: null,
    isInThread: false,
  };

  // El scroll vive en el lienzo; los overlays (sugerencias arriba, chat abajo)
  // son filas fijas del workspace y no se mueven.
  const scroller = () => $('canvas');
  const scrollTo = (top) => { const sc = scroller(); if (sc) sc.scrollTop = top; };
  const scrollToEnd = () => scrollTo(scroller()?.scrollHeight ?? 0);

  const a2ui = () => window.A2UIWeb ?? null;

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
    $('canvas').classList.toggle('is-busy', value);
    for (const mount of state.mounts) mount.setBusy(value);
    if (value) setStatus('state.busy');
    else setStatus(state.offline ? 'state.offline' : 'state.ready');
    if (!value) $('composerInput').focus();
  }

  // ---------- Lienzo ----------

  function setHasContent(on) {
    document.querySelector('.workspace')?.classList.toggle('has-content', on);
  }

  // En el estado vacío el composer vive dentro del lienzo, bajo el saludo. Antes
  // de limpiar el lienzo hay que devolverlo al workspace o se pierde del DOM.
  function ensureComposerInWorkspace() {
    const composer = $('composer');
    const workspace = document.querySelector('.workspace');
    if (composer && workspace && composer.parentElement !== workspace) {
      workspace.append(composer);
    }
  }

  function unmountAll() {
    for (const mount of state.mounts) mount.unmount();
    state.mounts = [];
    state.mount = null;
    state.head = null;
    state.turn = null;
  }

  // Quita el turno más reciente (DOM y montaje) sin tocar los anteriores.
  function dropCurrentTurn() {
    if (state.mount) {
      state.mount.unmount();
      state.mounts = state.mounts.filter((m) => m !== state.mount);
    }
    state.turn?.remove();
    state.mount = null;
    state.head = null;
    state.turn = null;
  }

  function clearCanvas() {
    ensureComposerInWorkspace();
    unmountAll();
    $('canvas').replaceChildren();
  }

  function resetThread() {
    state.threadEntryId = null;
    state.isInThread = false;
    state.history = [];
  }

  // "Nueva consulta": vuelve a la página principal ("¿Qué quieres…?") sin
  // borrar el historial de la línea de tiempo; solo cierra el hilo en curso.
  function newQuery() {
    resetThread();
    window.History?.clearActive?.();
    renderEmpty();
    const composer = $('composer');
    const input = composer?.querySelector('input');
    requestAnimationFrame(() => input?.focus());
  }

  function renderEmpty() {
    const { t } = window.I18N;
    const canvas = $('canvas');
    const composer = $('composer');
    const workspace = document.querySelector('.workspace');

    // Si el composer estaba dentro del canvas (estado vacío anterior), extráelo antes
    // de limpiar el canvas para no perder el elemento del DOM.
    if (composer && composer.closest('#canvas')) workspace?.append(composer);
    unmountAll();

    const empty = el('div', 'canvas-empty');

    const rawName = $('customerName')?.textContent ?? '';
    const firstName = (rawName && rawName !== '…' && rawName !== 'Banca en línea')
      ? rawName.split(' ')[0] : '';
    const title = firstName ? `¿Qué quieres ver hoy, ${firstName}?` : t('canvas.title');

    // Título y botón de info en el mismo renglón (reemplaza el hint card siempre visible)
    const head = el('div', 'canvas-empty-head');
    head.append(el('h2', null, title));

    const infoBtn = el('button', 'help-btn canvas-info-btn');
    infoBtn.type = 'button';
    infoBtn.dataset.help = 'canvas';
    infoBtn.setAttribute('aria-label', 'Cómo empezar');
    infoBtn.append(window.ICONS.el('alertInfo'));
    head.append(infoBtn);

    empty.append(head, el('p', null, t('canvas.text')));

    // Mueve el composer al centro, justo bajo el saludo (estilo Claude)
    if (composer) empty.append(composer);

    canvas.replaceChildren(empty);
    document.querySelector('.suggest')?.classList.remove('is-mini');
    setHasContent(false);
    state.active = null;
    state.threadEntryId = null;
    state.isInThread = false;
  }

  function renderThinking(prompt) {
    ensureComposerInWorkspace();
    const canvas = $('canvas');
    canvas.querySelector('.thinking')?.remove();
    let question = null;
    if (!state.isInThread) {
      // Hilo nuevo: limpiar contenido anterior antes del spinner
      clearCanvas();
    } else if (prompt) {
      question = el('div', 'conv-question', prompt);
      canvas.append(question);
    }
    const box = el('div', 'thinking');
    box.append(el('span', 'spinner'));
    const label = el('span', 'label', window.I18N.t('agent.thinking'));
    const tools = el('div', 'tools');
    box.append(label, tools);
    canvas.append(box);
    scrollToEnd();
    return { box, label, tools, question };
  }

  // Cabecera del turno (título, mensaje, carpeta, fecha, expandir). Se puede
  // actualizar después: el título y el mensaje llegan al final del turno,
  // cuando la superficie ya se está pintando.
  function buildHead({ title, folder, message, when, surfaceId, status }) {
    const head = el('div', 'canvas-head');
    const main = el('div');
    const h2 = el('h2', null, title ?? '');
    const p = el('p', null, message ?? '');
    p.hidden = !message;
    main.append(h2, p);
    const statusLine = el('div', 'canvas-status');
    statusLine.hidden = !status;
    if (status) statusLine.append(el('span', 'spinner'), el('span', null, status));
    main.append(statusLine);
    head.append(main);

    const meta = el('div', 'canvas-meta');
    const chip = el('span', 'folder-chip', folder ? window.History.folderLabel(folder) : '');
    chip.hidden = !folder;
    meta.append(chip);
    const whenNode = el('span', 'muted', when ? window.I18N.fmtWhen(when) : '');
    whenNode.hidden = !when;
    meta.append(whenNode);
    // Las gráficas densas se aprecian mejor sin el riel al lado: la misma
    // superficie se monta en el overlay a todo el ancho del diálogo (y comparte
    // el store: mover un control en el overlay también mueve el lienzo).
    const expand = el('button', 'canvas-expand');
    expand.type = 'button';
    expand.title = window.I18N.t('canvas.expand');
    expand.setAttribute('aria-label', window.I18N.t('canvas.expand'));
    expand.append(window.ICONS.el('expand'));
    expand.addEventListener('click', () => window.UI.openOverlay({
      title: h2.textContent,
      folderLabel: chip.textContent,
      meta: when ? window.I18N.fmtDateTime(when) : (p.textContent ?? ''),
      spec: { ui: [] },
      surfaceId,
    }));
    meta.append(expand);

    return {
      node: head,
      meta,
      update({ title: newTitle, message: newMessage, folder: newFolder, status: newStatus }) {
        if (newTitle !== undefined) h2.textContent = newTitle ?? '';
        if (newMessage !== undefined) { p.textContent = newMessage ?? ''; p.hidden = !newMessage; }
        if (newFolder !== undefined) { chip.textContent = newFolder ? window.History.folderLabel(newFolder) : ''; chip.hidden = !newFolder; }
        if (newStatus !== undefined) {
          statusLine.replaceChildren();
          statusLine.hidden = !newStatus;
          if (newStatus) statusLine.append(el('span', 'spinner'), el('span', null, newStatus));
        }
      },
    };
  }

  // Abre el contenedor de un turno: en el primero reemplaza el lienzo, en un
  // hilo se apila debajo. `replaceTurn` cambia el turno recién abierto (el
  // esqueleto) por la superficie definitiva sin duplicarlo.
  function openTurn({ replaceTurn = false } = {}) {
    const canvas = $('canvas');
    canvas.querySelector('.thinking')?.remove();
    if (replaceTurn && state.turn) dropCurrentTurn();
    else if (state.isInThread) { state.mount = null; state.head = null; state.turn = null; }
    else clearCanvas();
    const turn = el('div', 'conv-turn');
    canvas.append(turn);
    state.turn = turn;
    return turn;
  }

  function finishTurn() {
    if (state.isInThread) {
      scrollToEnd();
    } else {
      scrollTo(0);
      state.isInThread = true;
    }
    setHasContent(true);
    renderFollowUps();
  }

  // ---------- Follow-ups inteligentes ----------

  // Sugerencias de qué preguntar, armadas en el cliente según lo que trae la
  // superficie activa (gráficas, movimientos, KPIs) y el tema del turno. No
  // depende del modelo: aparecen siempre, sin llamada extra ni espera.
  function surfaceComponents(surfaceId) {
    const store = window.A2UIWeb?.store;
    const surface = store?.get?.(surfaceId);
    return surface && surface.components ? [...surface.components.values()] : [];
  }

  function followUpTopic(text) {
    const low = String(text || '').toLowerCase();
    if (/(gasto|egres)/.test(low)) return { noun: 'gastos', question: '¿En qué estoy gastando más?' };
    if (/(ingres|saldo)/.test(low)) return { noun: 'ingresos', question: '¿De dónde vienen mis ingresos?' };
    if (/ahorr/.test(low)) return { noun: 'ahorro', question: '¿Cómo puedo ahorrar más?' };
    if (/inversi/.test(low)) return { noun: 'inversiones', question: '¿Cómo van mis inversiones?' };
    if (/cr[eé]dito|tarjeta/.test(low)) return { noun: 'tarjeta', question: '¿Cómo puedo pagar menos intereses?' };
    return null;
  }

  function suggestFollowUps(surfaceId, title) {
    const comps = surfaceComponents(surfaceId);
    const topic = followUpTopic(title);
    const kinds = new Set(comps.map((c) => c.component));
    const out = [];

    const push = (text) => { if (out.length < 3) out.push(text); };

    if (kinds.has('Chart')) {
      const chart = comps.find((c) => c.component === 'Chart');
      const radial = ['pie', 'doughnut', 'radar', 'gauge'].includes(chart?.chartType);
      if (topic) {
        if (radial) push(`¿Qué parte de mis ${topic.noun} representa cada segmento?`);
        else push(`Muéstrame mis ${topic.noun} por categoría`);
        push(`¿Cómo bajo mis ${topic.noun} este mes?`);
        push(topic.question);
      } else {
        if (radial) push('¿Qué domina aquí y por qué?');
        else push('¿Qué tendencia hay en los últimos meses?');
        push('Compara estas cifras con el periodo anterior');
        push('Muéstralo por categoría');
      }
    }

    if (kinds.has('TransactionList') || kinds.has('Table')) {
      push('Explícame los movimientos más grandes');
      push(topic?.question || '¿En qué estoy gastando más?');
    }

    if (kinds.has('Kpi')) push('¿Por qué cambió ese indicador?');

    const generic = [
      'Hazme una gráfica de esto',
      'Dame más detalle con cifras',
      'Explícamelo como si fuera para mi mamá',
      'Dame una sugerencia para mejorar esto',
    ];
    while (out.length < 3 && generic.length) push(generic.shift());
    return out.slice(0, 3);
  }

  // Chips debajo del turno: un clic envia la pregunta como follow-up del hilo.
  function renderFollowUps() {
    const turn = state.turn;
    if (!turn) return;
    turn.querySelector('.follow-ups')?.remove();
    const active = state.active;
    if (!active?.surfaceId || surfaceComponents(active.surfaceId).length === 0) return;
    const prompts = suggestFollowUps(active.surfaceId, active.title);
    if (!prompts.length) return;
    const row = el('div', 'follow-ups');
    for (const question of prompts) {
      const chip = el('button', 'fu-chip', question);
      chip.type = 'button';
      chip.addEventListener('click', () => send(question));
      row.append(chip);
    }
    turn.append(row);
  }

  // Monta una superficie del store en el lienzo con su cabecera.
  function renderSurface({ surfaceId, title, folder, message, when, status, replaceTurn = false }) {
    const runtime = a2ui();
    if (!runtime) return null;
    const turn = openTurn({ replaceTurn });
    const head = buildHead({ title, folder, message, when, surfaceId, status });
    const stack = el('div', 'gen-stack a2-surface');
    const bubble = el('div', 'canvas-bubble');
    bubble.append(head.node, stack, head.meta);
    turn.append(bubble);
    state.mount = runtime.mount(stack, surfaceId);
    state.mounts.push(state.mount);
    state.mount.setBusy(state.busy);
    state.head = head;
    state.active = { surfaceId, title: title ?? '' };
    finishTurn();
    return head;
  }

  // Sin runtime A2UI (el módulo no cargó): se pinta la proyección v1.
  function renderLegacy({ title, folder, message, ui, when, replaceTurn = false }) {
    const turn = openTurn({ replaceTurn });
    const head = buildHead({ title, folder, message, when });
    const stack = el('div', 'gen-stack');
    window.renderGeneratedUi(stack, ui ?? []);
    const bubble = el('div', 'canvas-bubble');
    bubble.append(head.node, stack, head.meta);
    turn.append(bubble);
    state.head = head;
    finishTurn();
  }

  function showEntry(entry) {
    // Abrir un item del historial siempre arranca una vista limpia;
    // el threadEntryId apunta a ese item para que los follow-ups lo actualicen.
    state.isInThread = false;
    state.threadEntryId = entry.id ?? null;
    state.history = [];
    const runtime = a2ui();
    const surface = entry.spec?.surface;
    if (runtime && surface?.surfaceId) {
      runtime.loadSurface(surface);
      renderSurface({
        surfaceId: surface.surfaceId,
        title: entry.title,
        folder: entry.folder,
        message: entry.message ?? entry.spec?.message,
        when: entry.createdAt,
      });
      return;
    }
    renderLegacy({
      title: entry.title,
      folder: entry.folder,
      message: entry.message ?? entry.spec?.message,
      ui: entry.spec?.ui,
      when: entry.createdAt,
    });
  }

  // ---------- Envío ----------

  function requestContext() {
    const runtime = a2ui();
    return {
      history: state.history,
      surface: runtime && state.active ? runtime.activeSurface(state.active.surfaceId, state.active.title) : null,
      client: runtime ? runtime.capabilities() : null,
    };
  }

  // Un turno completo: texto libre (`message`) o acción tipada (`action`).
  async function runTurn({ message, action, liveTitle, fromVoice = false }) {
    const { t } = window.I18N;
    const runtime = a2ui();
    window.Voice?.silence();
    setBusy(true);
    // Si el turno falla (modelo saturado, red), la pantalla anterior vuelve en
    // vez de dejar el lienzo vacío: la persona puede reintentar desde donde estaba.
    const previous = state.active && state.head
      ? { ...state.active, head: state.head, mount: state.mount, turn: state.turn }
      : null;
    const inThread = state.isInThread;
    const thinking = renderThinking(liveTitle);
    const restorePrevious = () => {
      if (inThread && previous) {
        // El turno anterior sigue en pantalla: basta con retirar la pregunta y el spinner.
        thinking.box.remove();
        thinking.question?.remove();
        if (state.turn && state.turn !== previous.turn) dropCurrentTurn();
        state.mount = previous.mount;
        state.head = previous.head;
        state.turn = previous.turn;
        state.active = { surfaceId: previous.surfaceId, title: previous.title };
        return true;
      }
      if (runtime && previous && runtime.store.has(previous.surfaceId)) {
        state.isInThread = false;
        renderSurface({ surfaceId: previous.surfaceId, title: previous.title });
        return true;
      }
      return false;
    };
    window.History.setLive(true, liveTitle);

    const toolsSeen = new Set();
    let generated = null;
    let surfaceShown = false;
    let lastStatus = '';
    // La cabecera solo recibe el estado del turno cuando ya es la de este turno.
    const turnHead = () => (surfaceShown ? state.head : null);

    const onEvent = (event) => {
      switch (event.type) {
        case 'status':
          lastStatus = event.text;
          thinking.label.textContent = event.text;
          turnHead()?.update({ status: event.text });
          break;
        case 'tool_call':
          if (!toolsSeen.has(event.name)) {
            toolsSeen.add(event.name);
            const chip = el('span', 'tool-chip');
            chip.appendChild(window.ICONS.el('gear'));
            chip.appendChild(el('span', null, event.name));
            thinking.tools.append(chip);
          }
          lastStatus = t('agent.tool', { tool: event.name });
          thinking.label.textContent = lastStatus;
          turnHead()?.update({ status: lastStatus });
          break;
        case 'a2ui': {
          if (!runtime) break;
          const applied = runtime.applyMessage(event.message);
          const created = event.message.createSurface;
          const deleted = event.message.deleteSurface;
          if (created && applied) {
            // Primera superficie del turno: el lienzo deja de "pensar" y empieza a construirse.
            surfaceShown = true;
            renderSurface({ surfaceId: created.surfaceId, title: liveTitle, status: lastStatus || t('agent.building') });
          } else if (deleted && surfaceShown && state.active?.surfaceId === deleted.surfaceId) {
            // El esqueleto se retiró: el turno fue un patch sobre la superficie anterior.
            surfaceShown = false;
            dropCurrentTurn();
            if (previous) {
              state.mount = previous.mount;
              state.head = previous.head;
              state.turn = previous.turn;
              state.active = { surfaceId: previous.surfaceId, title: previous.title };
            }
          }
          break;
        }
        case 'ui':
          generated = event;
          thinking.box.remove();
          if (event.patch) {
            // La superficie activa ya recibió los updateDataModel; solo cambia el mensaje.
            if (state.head) state.head.update({ message: event.message, status: '' });
            else if (runtime && state.active) renderSurface({ surfaceId: state.active.surfaceId, title: event.title, folder: event.folder, message: event.message });
            setHasContent(true);
            break;
          }
          if (runtime && event.surface?.surfaceId) {
            if (!surfaceShown || state.active?.surfaceId !== event.surface.surfaceId) {
              runtime.loadSurface(event.surface);
              renderSurface({ surfaceId: event.surface.surfaceId, title: event.title, folder: event.folder, message: event.message, replaceTurn: surfaceShown });
              surfaceShown = true;
            } else {
              state.head?.update({ title: event.title, message: event.message, folder: event.folder, status: '' });
              state.active = { surfaceId: event.surface.surfaceId, title: event.title ?? '' };
            }
          } else {
            renderLegacy({ title: event.title, folder: event.folder, message: event.message, ui: event.ui, replaceTurn: surfaceShown });
            surfaceShown = true;
          }
          if (fromVoice) window.Voice?.speak(event.message, window.I18N.locale());
          break;
        case 'history':
          // La API ya la guardó en Tiger. En un hilo se actualiza la misma
          // entrada; si es una visualización nueva entra a la línea de tiempo y a su carpeta.
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
    };

    try {
      const context = requestContext();
      if (action) await window.API.streamAction({ action, ...context, onEvent });
      else await window.API.streamChat({ message, ...context, onEvent });

      if (!generated) {
        window.UI.toast(t('agent.noResponse'), 'error');
        if (!restorePrevious()) renderEmpty();
      } else {
        const userTurn = action ? `[action:${action.event.name}] ${JSON.stringify(action.event.context ?? {})}` : message;
        state.history.push({ role: 'user', content: userTurn }, { role: 'assistant', content: generated.message ?? '' });
        if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
        state.head?.update({ status: '' });
      }
    } catch (err) {
      const text = err.name === 'AbortError' ? t('agent.timeout') : t('agent.error', { msg: err.message });
      window.UI.toast(text, 'error');
      if (!generated && !surfaceShown && !restorePrevious()) renderEmpty();
    } finally {
      window.History.setLive(false);
      setBusy(false);
    }
  }

  async function send(text, { fromVoice = false, newThread = false } = {}) {
    const prompt = String(text ?? '').trim();
    if (state.busy || !prompt) return;
    // Visualización nueva: descarta el hilo, el contexto y la superficie anteriores.
    if (newThread) {
      resetThread();
      state.active = null;
    }
    await runTurn({ message: prompt, liveTitle: prompt, fromVoice });
  }

  // Evento tipado desde la UI generada (Button o Form del renderer A2UI).
  async function sendAction(payload) {
    if (state.busy || !payload?.event?.name) return;
    const label = window.I18N.t('agent.action', { name: payload.event.name.replace(/_/g, ' ') });
    await runTurn({ action: payload, liveTitle: label });
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

    $('newQueryBtn')?.addEventListener('click', newQuery);

    // Al scrollear el chat, las sugerencias se minimizan a una barrita para no
    // quitarle espacio; al volver arriba se despliegan solas.
    $('canvas').addEventListener('scroll', () => {
      document.querySelector('.suggest')?.classList.toggle('is-mini', $('canvas').scrollTop >= 24);
    }, { passive: true });

    $('micBtn').addEventListener('click', () => {
      window.Voice.dictate({
        input: $('composerInput'),
        button: $('micBtn'),
        onResult: (text) => { $('composerInput').value = ''; send(text, { fromVoice: true }); },
      });
    });

    // Botones y formularios de la superficie A2UI.
    const wireActions = () => a2ui()?.onAction((payload) => sendAction(payload));
    if (a2ui()) wireActions();
    else window.addEventListener('a2ui:ready', wireActions, { once: true });

    // Formularios del renderer v1 (miniaturas y modo sin runtime): se
    // devuelven como un mensaje más del mismo turno.
    window.addEventListener('genui:form-submit', (e) => {
      const { action, payload } = e.detail;
      send(`[form:${action}] ${payload}`);
    });
  }

  window.Agent = {
    init, send, sendAction, showEntry, renderEmpty, newQuery,
    get isBusy() { return state.busy; },
    get activeSurface() { return state.active; },
  };
})();

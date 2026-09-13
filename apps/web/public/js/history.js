// Riel derecho: las dos pestañas del historial de visualizaciones.
//
//   HISTORIAL  → línea de tiempo, lo más reciente arriba, agrupado por día.
//   COLECCIÓN  → las carpetas que el agente asignó, desplegables.
//
// Los datos vienen de /api/history (hypertable ui_history en Tiger Data) y el
// buscador de arriba filtra las dos pestañas a la vez.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  // Cuántos componentes del spec se dibujan en la miniatura: más no se alcanza
  // a leer a escala 0.22 y encarece el render de toda la lista.
  const PREVIEW_COMPONENTS = 2;
  const TIMELINE_LIMIT = 40;
  const DRAWER_MS = 280;
  const SEARCH_DEBOUNCE_MS = 220;

  const state = {
    entries: [],
    folders: [],
    openFolder: null,
    activeId: null,
    search: '',
    tab: 'history',
    live: null,
    onOpen: null,
  };

  const folderLabel = (id) => state.folders.find((f) => f.id === id)?.label ?? id;

  // ---------- Pestañas ----------

  function selectTab(tab, { focus = false } = {}) {
    state.tab = tab;
    for (const button of document.querySelectorAll('.rail-tab')) {
      const on = button.dataset.tab === tab;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      if (on && focus) button.focus();
    }
    for (const panel of document.querySelectorAll('.rail-panel')) {
      const on = panel.id === (tab === 'history' ? 'panelHistory' : 'panelCollection');
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    }
    // El cajón abierto se remide al volver: estaba en un panel oculto y su
    // scrollHeight era 0 mientras tanto.
    if (tab === 'collection') requestAnimationFrame(resizeOpenDrawer);
  }

  function wireTabs() {
    const tabs = [...document.querySelectorAll('.rail-tab')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => selectTab(button.dataset.tab));
      button.addEventListener('keydown', (e) => {
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!delta) return;
        e.preventDefault();
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        selectTab(next.dataset.tab, { focus: true });
      });
    });
  }

  // ---------- Miniatura ----------

  function buildPreview(entry) {
    const preview = el('span', 'tl-thumb');
    const inner = el('span', 'tl-thumb-inner');
    // El título ya está al lado, en texto legible: la miniatura se salta la
    // cabecera y arranca en lo que sí distingue una entrada de otra (la barra,
    // la dona, las tarjetas de saldo). Si el spec fuera solo cabecera, se
    // dibuja esa.
    const ui = entry.spec?.ui ?? [];
    const visual = ui.filter((c) => c?.type !== 'header');
    window.renderGeneratedUi(inner, (visual.length ? visual : ui).slice(0, PREVIEW_COMPONENTS), { preview: true });
    preview.append(inner);
    return preview;
  }

  // ---------- Línea de tiempo ----------

  // Etiqueta del grupo: "Hoy" y "Ayer" se leen mejor que la fecha completa; de
  // ahí para atrás la fecha, con año solo si no es el actual.
  function dayLabel(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
    if (days <= 0) return window.I18N.t('timeline.today');
    if (days === 1) return window.I18N.t('timeline.yesterday');
    const opts = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return date.toLocaleDateString(window.I18N.locale(), opts);
  }

  function buildTimelineItem(entry, index) {
    const button = el('button', 'tl-item');
    button.type = 'button';
    button.style.setProperty('--i', String(index));
    button.dataset.id = entry.id;
    if (entry.id === state.activeId) button.classList.add('is-active');

    const main = el('span', 'tl-main');
    main.append(el('span', 'tl-title', entry.title));
    const meta = el('span', 'tl-meta');
    meta.append(el('span', 'folder-chip', folderLabel(entry.folder)));
    meta.append(el('span', 'tl-time', window.I18N.fmtTime(entry.createdAt)));
    main.append(meta);

    button.append(buildPreview(entry), main);
    button.addEventListener('click', () => open(entry.id));
    return button;
  }

  function buildLiveItem(title) {
    const item = el('div', 'tl-item is-live');
    const thumb = el('span', 'tl-thumb');
    const dots = el('span', 'tl-live-dots');
    dots.append(el('span'), el('span'), el('span'));
    thumb.append(dots);
    const main = el('span', 'tl-main');
    main.append(el('span', 'tl-title', title));
    const meta = el('span', 'tl-meta');
    meta.append(el('span', 'tl-live-status', window.I18N.t('agent.thinking')));
    main.append(meta);
    item.append(thumb, main);
    return item;
  }

  function renderTimeline() {
    const root = $('timeline');
    root.replaceChildren();
    const fragment = document.createDocumentFragment();

    if (state.live) fragment.append(buildLiveItem(state.live));

    if (!state.entries.length) {
      if (!state.live) {
        fragment.append(el('p', 'tl-empty', window.I18N.t(state.search ? 'rail.noResults' : 'timeline.empty', { q: state.search })));
      }
      root.append(fragment);
      return;
    }

    let currentDay = null;
    state.entries.slice(0, TIMELINE_LIMIT).forEach((entry, i) => {
      const day = dayLabel(entry.createdAt);
      if (day !== currentDay) {
        currentDay = day;
        fragment.append(el('h2', 'tl-day', day));
      }
      fragment.append(buildTimelineItem(entry, i));
    });
    root.append(fragment);
  }

  function renderSkeleton() {
    const root = $('timeline');
    root.replaceChildren();
    for (let i = 0; i < 5; i++) root.append(el('div', 'tl-skeleton skeleton'));
  }

  // ---------- Carpetas ----------

  function entriesOf(folderId) {
    return state.entries.filter((entry) => entry.folder === folderId);
  }

  function buildFolder(folder, index) {
    const wrap = el('div', 'folder');
    wrap.dataset.folder = folder.id;
    wrap.dataset.stack = folder.total >= 3 ? '3' : folder.total === 2 ? '2' : '1';
    wrap.style.setProperty('--i', String(index));

    const head = el('button', 'folder-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.append(el('span', 'folder-name', folder.label));
    // Sin búsqueda el contador es el total de la carpeta; con búsqueda pasa a
    // contar coincidencias, que es lo que el usuario está viendo dentro.
    const matches = entriesOf(folder.id).length;
    const count = el('span', 'folder-count', String(state.search ? matches : folder.total));
    if (state.search) count.title = window.I18N.t('folder.ofTotal', { total: folder.total });
    head.append(count);
    const chevron = el('span', 'folder-chevron');
    chevron.append(window.ICONS.el('chevron'));
    head.append(chevron);
    head.addEventListener('click', () => toggle(folder.id));

    const drawer = el('div', 'folder-drawer');
    drawer.append(buildFolderList(folder.id));

    wrap.append(head, drawer);
    return wrap;
  }

  function buildFolderList(folderId) {
    const list = el('ul', 'folder-list');
    const items = entriesOf(folderId);
    if (!items.length) {
      list.append(el('li', 'folder-empty', window.I18N.t(state.search ? 'rail.noResults' : 'folder.empty', { q: state.search })));
      return list;
    }
    items.forEach((entry, i) => {
      const item = el('li');
      const button = el('button', 'folder-item');
      button.type = 'button';
      button.style.setProperty('--i', String(i));
      button.dataset.id = entry.id;
      if (entry.id === state.activeId) button.classList.add('is-active');
      button.append(el('span', 'fi-bar'));
      const main = el('div', 'fi-main');
      main.append(el('div', 'fi-title', entry.title));
      main.append(el('div', 'fi-date', window.I18N.fmtDateTime(entry.createdAt)));
      button.append(main);
      button.addEventListener('click', () => open(entry.id));
      item.append(button);
      list.append(item);
    });
    return list;
  }

  function renderFolders() {
    const root = $('folders');
    root.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.folders.forEach((folder, i) => fragment.append(buildFolder(folder, i)));
    root.append(fragment);
    // Una carpeta abierta sigue abierta tras redibujar (por ejemplo al buscar).
    if (state.openFolder) expand(state.openFolder, { animate: false });
    markSearchMatches();
  }

  // El deslizamiento usa max-height medida en el momento: así el cajón se abre
  // exactamente a lo que ocupan sus entradas, tenga dos o veinte.
  function expand(folderId, { animate = true } = {}) {
    const wrap = $('folders').querySelector(`[data-folder="${folderId}"]`);
    if (!wrap) return;
    const drawer = wrap.querySelector('.folder-drawer');
    if (!animate) drawer.style.transition = 'none';
    wrap.classList.add('is-open');
    wrap.querySelector('.folder-head').setAttribute('aria-expanded', 'true');
    drawer.style.maxHeight = `${drawer.scrollHeight}px`;
    if (!animate) requestAnimationFrame(() => { drawer.style.transition = ''; });
  }

  function collapse(folderId) {
    const wrap = $('folders').querySelector(`[data-folder="${folderId}"]`);
    if (!wrap) return;
    const drawer = wrap.querySelector('.folder-drawer');
    // `is-closing` dispara la animación inversa de las entradas mientras el
    // cajón se cierra; se retira al terminar para no dejarlas invisibles.
    wrap.classList.add('is-closing');
    wrap.classList.remove('is-open');
    wrap.querySelector('.folder-head').setAttribute('aria-expanded', 'false');
    drawer.style.maxHeight = '0px';
    setTimeout(() => wrap.classList.remove('is-closing'), DRAWER_MS);
  }

  function toggle(folderId) {
    if (state.openFolder === folderId) {
      collapse(folderId);
      state.openFolder = null;
      return;
    }
    if (state.openFolder) collapse(state.openFolder);
    state.openFolder = folderId;
    expand(folderId);
  }

  // Si la altura del cajón abierto cambió (llegó una entrada nueva), se reajusta.
  function resizeOpenDrawer() {
    if (!state.openFolder) return;
    const wrap = $('folders').querySelector(`[data-folder="${state.openFolder}"]`);
    const drawer = wrap?.querySelector('.folder-drawer');
    if (drawer) drawer.style.maxHeight = `${drawer.scrollHeight}px`;
  }

  // Con una búsqueda activa se atenúan las carpetas sin coincidencias.
  function markSearchMatches() {
    const root = $('folders');
    for (const wrap of root.querySelectorAll('.folder')) {
      const hasMatches = entriesOf(wrap.dataset.folder).length > 0;
      wrap.classList.toggle('is-filtered', Boolean(state.search) && hasMatches);
      wrap.classList.toggle('is-muted', Boolean(state.search) && !hasMatches);
    }
  }

  // ---------- Selección ----------

  function markActive() {
    for (const node of document.querySelectorAll('.tl-item, .folder-item')) {
      node.classList.toggle('is-active', node.dataset.id === state.activeId);
    }
  }

  function open(id) {
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return;
    state.activeId = id;
    markActive();
    state.onOpen?.(entry);
  }

  // ---------- Datos ----------

  async function load({ silent = false } = {}) {
    if (!silent) renderSkeleton();
    try {
      const data = await window.API.fetchHistory({ search: state.search || undefined, limit: 60 });
      state.entries = data.entries;
      state.folders = data.folders;
      window.UI.hideBanner();
      renderTimeline();
      renderFolders();
      return data;
    } catch (err) {
      console.error('[history]', err);
      state.entries = [];
      renderTimeline();
      window.UI.banner(window.I18N.t('error.history'), () => load());
      return null;
    }
  }

  // Entrada recién generada por el agente: se inserta al frente sin recargar y
  // el contador de su carpeta rebota para que se vea a dónde fue a parar.
  function add(entry) {
    state.entries = [entry, ...state.entries.filter((e) => e.id !== entry.id)];
    const folder = state.folders.find((f) => f.id === entry.folder);
    if (folder) folder.total += 1;
    state.activeId = entry.id;

    renderTimeline();
    renderFolders();
    bumpCount(entry.folder);
    $('panelHistory').scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Entrada fantasma arriba de la línea de tiempo mientras el agente construye:
  // deja claro que la visualización en curso va a terminar ahí.
  function setLive(on, title) {
    state.live = on ? title : null;
    renderTimeline();
    if (on) $('panelHistory').scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bumpCount(folderId) {
    const count = $('folders').querySelector(`[data-folder="${folderId}"] .folder-count`);
    if (!count) return;
    count.classList.add('is-bumped');
    setTimeout(() => count.classList.remove('is-bumped'), 320);
  }

  // ---------- Búsqueda ----------

  function wireSearch() {
    const input = $('railSearch');
    const clear = $('railSearchClear');
    let timer = null;

    const run = () => {
      state.search = input.value.trim();
      clear.hidden = !state.search;
      load({ silent: true }).then(resizeOpenDrawer);
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; clearTimeout(timer); run(); }
    });
    clear.addEventListener('click', () => { input.value = ''; input.focus(); run(); });
  }

  function init({ onOpen } = {}) {
    state.onOpen = onOpen;
    wireTabs();
    wireSearch();
    window.addEventListener('resize', resizeOpenDrawer);
  }

  function updateEntry(oldId, newEntry) {
    const idx = state.entries.findIndex((e) => e.id === oldId);
    if (idx === -1) { add(newEntry); return newEntry.id; }
    state.entries[idx] = newEntry;
    const folder = state.folders.find((f) => f.id === newEntry.folder);
    if (folder && newEntry.folder !== state.entries[idx]?.folder) folder.total += 1;
    state.activeId = newEntry.id;
    renderTimeline();
    renderFolders();
    return newEntry.id;
  }

  window.History = {
    init, load, add, updateEntry, open, setLive, folderLabel, selectTab,
    get entries() { return state.entries; },
  };
})();

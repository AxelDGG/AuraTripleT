// Historial de visualizaciones: el carrusel de arriba y las carpetas del riel
// derecho. Los datos vienen de /api/history (hypertable ui_history en Tiger
// Data) y la carpeta de cada entrada la decidió el agente.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  // Cuántos componentes del spec se dibujan en la miniatura: más no se alcanza
  // a leer a escala 0.32 y encarece el render de todo el carrusel.
  const PREVIEW_COMPONENTS = 3;
  const CAROUSEL_LIMIT = 24;
  const DRAWER_MS = 280;
  const SEARCH_DEBOUNCE_MS = 220;

  const state = {
    entries: [],
    folders: [],
    openFolder: null,
    activeId: null,
    search: '',
    onOpen: null,
  };

  const folderLabel = (id) => state.folders.find((f) => f.id === id)?.label ?? id;

  // ---------- Carrusel ----------

  function buildPreview(entry) {
    const preview = el('div', 'car-preview');
    const inner = el('div', 'car-preview-inner');
    window.renderGeneratedUi(inner, (entry.spec?.ui ?? []).slice(0, PREVIEW_COMPONENTS), { preview: true });
    preview.append(inner);
    return preview;
  }

  function buildCard(entry, index) {
    const card = el('li');
    const button = el('button', 'car-card');
    button.type = 'button';
    button.style.setProperty('--i', String(index));
    button.dataset.id = entry.id;
    if (entry.id === state.activeId) button.classList.add('is-active');

    const body = el('div', 'car-body');
    body.append(el('div', 'car-title', entry.title));
    const meta = el('div', 'car-meta');
    meta.append(el('span', 'folder-chip', folderLabel(entry.folder)));
    meta.append(el('span', null, window.I18N.fmtWhen(entry.createdAt)));
    body.append(meta);

    button.append(buildPreview(entry), body);
    button.addEventListener('click', () => open(entry.id));
    card.append(button);
    return card;
  }

  function renderCarousel() {
    const track = $('carTrack');
    track.replaceChildren();
    if (!state.entries.length) {
      const empty = el('li', 'car-empty', window.I18N.t(state.search ? 'rail.noResults' : 'carousel.empty', { q: state.search }));
      track.append(empty);
      updateNav();
      return;
    }
    const fragment = document.createDocumentFragment();
    state.entries.slice(0, CAROUSEL_LIMIT).forEach((entry, i) => fragment.append(buildCard(entry, i)));
    track.append(fragment);
    updateNav();
  }

  function renderSkeleton() {
    const track = $('carTrack');
    track.replaceChildren();
    for (let i = 0; i < 4; i++) track.append(el('li', 'car-skeleton skeleton'));
  }

  function updateNav() {
    const viewport = $('carTrack').parentElement;
    const atStart = viewport.scrollLeft <= 2;
    const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
    $('carPrev').disabled = atStart;
    $('carNext').disabled = atEnd;
  }

  function scrollCarousel(direction) {
    const viewport = $('carTrack').parentElement;
    const card = viewport.querySelector('.car-card');
    // Se avanza de dos en dos tarjetas; si aún no hay ninguna, media ventana.
    const step = card ? (card.offsetWidth + 12) * 2 : viewport.clientWidth * 0.6;
    viewport.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  // ---------- Carpetas ----------

  function entriesOf(folderId) {
    return state.entries.filter((entry) => entry.folder === folderId);
  }

  function buildFolder(folder, index) {
    const wrap = el('div', 'folder');
    wrap.dataset.folder = folder.id;
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
    for (const node of document.querySelectorAll('.car-card, .folder-item')) {
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
      renderCarousel();
      renderFolders();
      return data;
    } catch (err) {
      console.error('[history]', err);
      state.entries = [];
      renderCarousel();
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

    renderCarousel();
    renderFolders();
    bumpCount(entry.folder);
    $('carTrack').parentElement.scrollTo({ left: 0, behavior: 'smooth' });
  }

  // Tarjeta fantasma al frente del carrusel mientras el agente construye: deja
  // claro que la visualización en curso va a terminar ahí.
  function setLive(on, title) {
    const track = $('carTrack');
    track.querySelector('.car-live')?.closest('li')?.remove();
    if (!on) return;
    track.querySelector('.car-empty')?.remove();
    const item = el('li');
    const card = el('div', 'car-card is-live car-live');
    const preview = el('div', 'car-preview');
    const dots = el('div', 'car-live-dots');
    dots.append(el('span'), el('span'), el('span'));
    preview.append(dots);
    const body = el('div', 'car-body');
    body.append(el('div', 'car-title', title));
    body.append(el('div', 'car-meta', window.I18N.t('agent.thinking')));
    card.append(preview, body);
    item.append(card);
    track.prepend(item);
    track.parentElement.scrollTo({ left: 0, behavior: 'smooth' });
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
    $('carPrev').addEventListener('click', () => scrollCarousel(-1));
    $('carNext').addEventListener('click', () => scrollCarousel(1));
    $('carTrack').parentElement.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', () => { updateNav(); resizeOpenDrawer(); });
    wireSearch();
  }

  window.History = { init, load, add, open, setLive, folderLabel, get entries() { return state.entries; } };
})();

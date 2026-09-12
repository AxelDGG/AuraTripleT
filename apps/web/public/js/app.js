// Arranque: carga de datos vía MCP, navegación, pestañas, barra de IA y atajos.
(function () {
  const $ = (id) => document.getElementById(id);
  const VIEWS = ['dashboard', 'portfolio', 'analysis', 'market', 'community'];
  const TABS = ['market', 'wallet', 'tools'];
  const state = { data: null, view: 'dashboard', tab: 'wallet', viewOpts: {} };

  function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = window.ICONS.icon(el.dataset.icon); });
  }

  function renderCustomer(customer) {
    const { t } = window.I18N;
    const parts = customer.name.split(' ');
    const first = parts[0];
    const initials = `${parts[0]?.[0] ?? ''}${parts[2]?.[0] ?? parts[1]?.[0] ?? ''}`.toUpperCase();
    $('welcomeName').textContent = first;
    $('profileName').textContent = `${parts[0]} ${parts[1]?.[0] ? `${parts[1][0]}.` : ''} ${parts[2] ?? ''}`.replace(/\s+/g, ' ').trim();
    $('profileEmail').textContent = customer.email;
    $('avatar').textContent = initials;
    $('profileBtn').title = t('profile.segment', { segment: customer.segment });
  }

  function currentViewRoot() { return $(`view-${state.view}`); }

  function renderView(view, opts = {}) {
    const { Views } = window;
    const root = $(`view-${view}`);
    if (!root || !state.data) return;
    if (view === 'portfolio') Views.renderPortfolio(root, state.data, opts);
    else if (view === 'analysis') Views.renderAnalysis(root, state.data);
    else if (view === 'market') Views.renderMarket(root, state.data);
    else if (view === 'community') Views.renderCommunity(root, state.data);
  }

  function renderTab(tab) {
    const { Views } = window;
    if (!state.data) return;
    if (tab === 'market') Views.renderMarket($('tab-market'), state.data);
    else if (tab === 'tools') Views.renderTools($('tab-tools'), state.data);
  }

  function navigate(view, opts = {}) {
    if (!VIEWS.includes(view)) view = 'dashboard';
    state.view = view;
    state.viewOpts = opts;
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    VIEWS.forEach((v) => { $(`view-${v}`).hidden = v !== view; });
    const isDash = view === 'dashboard';
    $('tabs').style.display = isDash ? '' : 'none';
    $('viewTitle').style.display = isDash ? 'none' : 'flex';
    if (!isDash) {
      $('viewTitleText').textContent = window.I18N.t(`view.${view}`);
      $('viewSubText').textContent = window.I18N.t(`view.${view}.sub`);
      renderView(view, opts);
    }
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectTab(tab) {
    if (!TABS.includes(tab)) return;
    state.tab = tab;
    document.querySelectorAll('#tabs .pill').forEach((p) => p.classList.toggle('is-active', p.dataset.tab === tab));
    TABS.forEach((tb) => $(`tab-${tb}`).classList.toggle('is-active', tb === tab));
    renderTab(tab);
  }

  function showError(message) {
    const { t } = window.I18N;
    const banner = $('banner');
    banner.hidden = false;
    banner.replaceChildren();
    const span = document.createElement('span');
    span.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'pill pill-sm';
    retry.textContent = t('toast.retry');
    retry.addEventListener('click', loadData);
    banner.append(span, retry);
  }

  async function loadData() {
    const { t } = window.I18N;
    $('banner').hidden = true;
    try {
      const data = await window.API.fetchDashboard();
      state.data = data;
      renderCustomer(data.customer);
      window.Dashboard.render(data);
      $('frame').classList.add('is-ready');
      const initial = location.hash.replace('#', '');
      navigate(VIEWS.includes(initial) ? initial : 'dashboard');
      renderTab(state.tab);
    } catch (err) {
      console.error('[app] dashboard:', err);
      $('frame').classList.add('is-ready');
      showError(t('error.dashboard'));
      window.Modals.toast(t('toast.loadError'), 'error');
    }
  }

  // ---------- Barra "Pregúntale a Norte AI" ----------
  function wireAsk() {
    const { t } = window.I18N;
    const form = $('askForm');
    const input = $('askInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) { window.AIPanel.open(); return; }
      input.value = '';
      window.AIPanel.open(text);
    });
    $('micBtn').addEventListener('click', () => {
      window.Voice.dictate({
        input,
        button: $('micBtn'),
        onResult: (text) => {
          input.value = '';
          window.AIPanel.open(text, { fromVoice: true });
        },
      });
    });
  }

  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); $('askInput').focus(); }
    });
  }

  function onLanguageChange() {
    window.I18N.apply();
    if (state.data) {
      renderCustomer(state.data.customer);
      window.Dashboard.rerenderTexts();
      renderTab(state.tab);
      if (state.view !== 'dashboard') {
        $('viewTitleText').textContent = window.I18N.t(`view.${state.view}`);
        $('viewSubText').textContent = window.I18N.t(`view.${state.view}.sub`);
        renderView(state.view, state.viewOpts);
      }
    }
    window.AIPanel.rerenderTexts();
  }

  // Al terminar la animación de entrada se retira data-anim para que el
  // fill-mode no deje contextos de apilamiento que tapen menús y popovers.
  function releaseEntranceAnimations() {
    document.addEventListener('animationend', (e) => {
      if ((e.animationName === 'rise' || e.animationName === 'pop') && e.target.hasAttribute?.('data-anim')) {
        e.target.removeAttribute('data-anim');
      }
    });
  }

  function boot() {
    fillIcons();
    releaseEntranceAnimations();
    window.I18N.apply();
    window.Dashboard.init();
    window.AIPanel.init();
    window.Modals.init();
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
    document.querySelectorAll('#tabs .pill').forEach((p) => p.addEventListener('click', () => selectTab(p.dataset.tab)));
    window.addEventListener('hashchange', () => { const v = location.hash.replace('#', ''); if (VIEWS.includes(v) && v !== state.view) navigate(v); });
    window.addEventListener('i18n:change', onLanguageChange);
    wireAsk();
    wireKeys();
    loadData();
  }

  window.App = { navigate, selectTab, reload: loadData, get state() { return state; } };
  document.addEventListener('DOMContentLoaded', boot);
})();

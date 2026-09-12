// Vista principal (Cartera): valor total, promo IA, watchlist, portafolio y rendimiento.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { data: null, holdingRange: '6M', wlFilter: 'most_viewed', perfRange: '1Y', chart: null, countedTo: 0 };
  const HOLDING_RANGES = ['1W', '1M', '6M', '1Y'];
  const WL_FILTERS = ['most_viewed', 'gain', 'lose'];

  function reducedMotion() {
    return document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateNumber(el, from, to, format, duration = 1300) {
    if (reducedMotion() || Math.abs(to - from) < 0.005) { el.innerHTML = format(to); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      el.innerHTML = format(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const holdingFormat = (n) => {
    const { fmtNumber } = window.I18N;
    return `<span class="cur">$</span>${fmtNumber(n)}`;
  };

  // ---------- Valor total ----------
  function renderHolding(animate = true) {
    const { t, fmtSigned, fmtPct } = window.I18N;
    const { portfolio, performance } = state.data;
    const valueEl = $('holdingValue');
    valueEl.classList.remove('skeleton');
    animateNumber(valueEl, animate ? state.countedTo : portfolio.totalValue, portfolio.totalValue, holdingFormat);
    state.countedTo = portfolio.totalValue;

    const series = performance.ranges[state.holdingRange];
    const delta = $('holdingDelta');
    delta.classList.remove('skeleton');
    delta.replaceChildren();
    const b = document.createElement('b');
    b.className = series.changeAbs >= 0 ? 'pos' : 'neg';
    b.textContent = `${fmtSigned(series.changeAbs)} (${fmtPct(series.changePct)})`;
    const span = document.createElement('span');
    span.textContent = t('holding.delta', { range: t(`range.${state.holdingRange}`) });
    delta.append(b, span);
    $('holdingRangeLabel').textContent = t(`range.${state.holdingRange}`);

    const menu = $('holdingMenu');
    menu.replaceChildren();
    for (const r of HOLDING_RANGES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = r === state.holdingRange ? 'is-active' : '';
      btn.innerHTML = `<span>${t(`range.${r}`)}</span>${r === state.holdingRange ? window.ICONS.icon('check') : ''}`;
      btn.addEventListener('click', () => { state.holdingRange = r; closeHoldingMenu(); renderHolding(false); });
      menu.append(btn);
    }
  }
  function toggleHoldingMenu() {
    const open = $('holdingMenu').classList.toggle('is-open');
    $('holdingChevron').classList.toggle('is-open', open);
    $('holdingChevron').setAttribute('aria-expanded', String(open));
  }
  function closeHoldingMenu() {
    $('holdingMenu').classList.remove('is-open');
    $('holdingChevron').classList.remove('is-open');
    $('holdingChevron').setAttribute('aria-expanded', 'false');
  }

  // ---------- Watchlist ----------
  function filteredWatchlist() {
    const items = state.data.watchlist.items;
    if (state.wlFilter === 'gain') return items.filter((w) => w.changePct > 0).sort((a, b) => b.changePct - a.changePct);
    if (state.wlFilter === 'lose') return items.filter((w) => w.changePct < 0).sort((a, b) => a.changePct - b.changePct);
    return [...items].sort((a, b) => b.views - a.views);
  }
  function renderWatchlist() {
    const { t, fmtNumber, fmtPct } = window.I18N;
    const filters = $('wlFilters');
    filters.replaceChildren();
    const labels = { most_viewed: 'watchlist.mostViewed', gain: 'watchlist.gain', lose: 'watchlist.lose' };
    for (const f of WL_FILTERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pill pill-sm${f === state.wlFilter ? ' is-active' : ''}`;
      btn.textContent = t(labels[f]);
      btn.addEventListener('click', () => { state.wlFilter = f; renderWatchlist(); });
      filters.append(btn);
    }
    const list = $('wlList');
    list.replaceChildren();
    const items = filteredWatchlist();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'wl-empty';
      empty.textContent = t('watchlist.empty');
      list.append(empty);
      return;
    }
    items.forEach((w, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wl-row gen';
      row.style.animationDelay = `${i * 60}ms`;
      row.title = w.name;
      row.innerHTML = `
        <span class="logo">${window.ICONS.logo(w.symbol)}</span>
        <span class="wl-main"><span class="wl-name truncate"></span><span class="wl-sub"></span></span>
        <span class="wl-right"><span class="wl-price num"></span><span class="wl-change ${w.changePct >= 0 ? 'pos' : 'neg'}"></span></span>`;
      row.querySelector('.wl-name').textContent = w.name;
      row.querySelector('.wl-sub').textContent = `${w.exchange}: ${w.symbol}`;
      row.querySelector('.wl-price').textContent = `$${fmtNumber(w.price)}`;
      row.querySelector('.wl-change').textContent = fmtPct(w.changePct);
      row.addEventListener('click', () => window.AIPanel.open(t('prompt.holding', { symbol: w.symbol })));
      list.append(row);
    });
  }

  // ---------- Mi portafolio ----------
  function renderPortfolio() {
    const { t, fmtMoney, fmtSigned, fmtPct } = window.I18N;
    const tiles = $('tiles');
    tiles.replaceChildren();
    state.data.portfolio.holdings.forEach((h, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile gen';
      tile.style.animationDelay = `${i * 70}ms`;
      tile.innerHTML = `
        <div class="tile-value num"></div>
        <div class="tile-change ${h.changePct >= 0 ? 'pos' : 'neg'}"></div>
        <div class="tile-foot"><span class="sym"><span class="logo logo-sm">${window.ICONS.logo(h.symbol)}</span><span></span></span><span><span class="u"></span> <b></b></span></div>`;
      tile.querySelector('.tile-value').textContent = fmtMoney(h.value);
      tile.querySelector('.tile-change').textContent = `${fmtSigned(h.changeAbs)} (${fmtPct(h.changePct, 2, false)})`;
      tile.querySelector('.sym span:last-child').textContent = h.symbol;
      tile.querySelector('.u').textContent = t('portfolio.units');
      tile.querySelector('.tile-foot b').textContent = String(h.units);
      tile.addEventListener('click', () => {
        window.Modals.toast(t('toast.holding', { symbol: h.symbol }));
        window.App.navigate('portfolio', { highlight: h.symbol });
      });
      tiles.append(tile);
    });
  }

  // ---------- Rendimiento ----------
  function renderPerformance({ animate = true } = {}) {
    const { t } = window.I18N;
    const ranges = state.data.performance.ranges;
    const seg = $('perfRanges');
    seg.replaceChildren();
    for (const r of Object.keys(ranges)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pill${r === state.perfRange ? ' is-active' : ''}`;
      btn.dataset.range = r;
      btn.textContent = t(`range.${r}`);
      btn.addEventListener('click', () => {
        if (state.perfRange === r) return;
        state.perfRange = r;
        seg.querySelectorAll('.pill').forEach((p) => p.classList.toggle('is-active', p.dataset.range === r));
        state.chart.setSeries(ranges[r], { morph: true });
      });
      seg.append(btn);
    }
    if (!state.chart) state.chart = new window.PerformanceChart($('perfChart'));
    state.chart.setSeries(ranges[state.perfRange], { animate });
  }

  function render(data, { animate = true } = {}) {
    state.data = data;
    renderHolding(animate);
    renderWatchlist();
    renderPortfolio();
    renderPerformance({ animate });
  }

  // Re-render de textos al cambiar idioma (sin volver a animar el trazado).
  function rerenderTexts() {
    if (!state.data) return;
    renderHolding(false);
    renderWatchlist();
    renderPortfolio();
    $('perfRanges').querySelectorAll('.pill').forEach((p) => { p.textContent = window.I18N.t(`range.${p.dataset.range}`); });
    state.chart?.refresh();
  }

  function init() {
    $('holdingChevron').addEventListener('click', (e) => { e.stopPropagation(); toggleHoldingMenu(); });
    $('holdingRangeBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleHoldingMenu(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) closeHoldingMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHoldingMenu(); });
    $('seeAllBtn').addEventListener('click', () => window.App.navigate('portfolio'));
    $('portfolioArrow').addEventListener('click', () => window.App.navigate('portfolio'));
    $('insightsBtn').addEventListener('click', () => window.AIPanel.open(window.I18N.t('prompt.insights')));
  }

  window.Dashboard = { init, render, rerenderTexts, state };
})();

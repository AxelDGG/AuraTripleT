// Vistas secundarias: Portafolio, Análisis, Mercado, Herramientas y Comunidad.
(function () {
  const PALETTE = ['#f2a9d3', '#8ec5ff', '#79e0a3', '#f5c36b', '#c9a8ff', '#ff8c9f', '#6ee7de', '#ffb88a', '#b5b5c8', '#9ad0f5', '#e6c27a', '#8f8fb8'];
  // Instancias de Chart.js de la vista Análisis: se destruyen antes de re-renderizar.
  let analysisCharts = [];

  // Constructor de DOM: h('div', { class: 'x', text: 'hola', on: { click: fn } }, child, ...)
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }
  const icon = (name) => window.ICONS.icon(name);
  const logo = (sym, small) => h('span', { class: `logo${small ? ' logo-sm' : ''}`, html: window.ICONS.logo(sym) });
  const card = (title, ...children) => h('article', { class: 'card', 'data-anim': '' },
    title ? h('div', { class: 'card-head' }, h('h3', { class: 'card-title', text: title })) : null, ...children);
  const stat = (label, value, sub, cls) => h('div', { class: 'stat', 'data-anim': 'pop' },
    h('div', { class: 'stat-label', text: label }), h('div', { class: `stat-value num${cls ? ` ${cls}` : ''}`, text: value }), sub ? h('div', { class: 'stat-sub', text: sub }) : null);

  function chartDefaults() {
    if (!window.Chart) return;
    window.Chart.defaults.color = '#a79ea6';
    window.Chart.defaults.font.family = 'Manrope, sans-serif';
    window.Chart.defaults.font.size = 11;
    window.Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  }

  // ---------- Portafolio ----------
  function renderPortfolio(root, data, opts = {}) {
    const { t, fmtMoney, fmtSigned, fmtPct, fmtNumber, fmtDate } = window.I18N;
    const p = data.portfolio;
    const best = [...p.holdings].sort((a, b) => b.changePct - a.changePct)[0] ?? null;
    root.replaceChildren(
      h('div', { class: 'grid-4' },
        stat(t('stat.total'), fmtMoney(p.totalValue), `${p.currency} · ${fmtDate(new Date().toISOString(), 'long')}`),
        stat(t('stat.day'), `${fmtSigned(p.totalChangeAbs)} (${fmtPct(p.totalChangePct)})`, null, p.totalChangeAbs >= 0 ? 'pos' : 'neg'),
        stat(t('stat.positions'), String(p.holdings.length), 'NASDAQ · USD'),
        stat(t('stat.best'), best?.symbol ?? '—', best ? fmtPct(best.changePct) : null, best && best.changePct >= 0 ? 'pos' : 'neg'),
      ),
      h('div', { class: 'grid-2' },
        card(t('holdings.title'), h('div', { class: 'c-table', style: 'overflow-x:auto' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ...[t('tbl.symbol'), t('tbl.units'), t('tbl.price'), t('tbl.value'), t('tbl.change'), t('tbl.weight')].map((c, i) => h('th', { class: i > 0 ? 'r' : '', text: c })))),
            h('tbody', {}, ...p.holdings.map((hd) => {
              const weight = p.allocation.find((a) => a.symbol === hd.symbol)?.pct ?? 0;
              const bar = h('i');
              requestAnimationFrame(() => { bar.style.width = `${weight}%`; });
              return h('tr', { class: opts.highlight === hd.symbol ? 'is-highlight' : '', style: opts.highlight === hd.symbol ? 'background:rgba(242,169,211,.06)' : '' },
                h('td', {}, h('div', { style: 'display:flex;align-items:center;gap:9px' }, logo(hd.symbol, true), h('div', {}, h('b', { text: hd.symbol }), h('div', { class: 'muted', style: 'font-size:11px', text: hd.name })))),
                h('td', { class: 'r num', text: String(hd.units) }),
                h('td', { class: 'r num', text: `$${fmtNumber(hd.price)}` }),
                h('td', { class: 'r num', text: fmtMoney(hd.value) }),
                h('td', { class: `r num ${hd.changePct >= 0 ? 'pos' : 'neg'}`, text: `${fmtSigned(hd.changeAbs)} (${fmtPct(hd.changePct)})` }),
                h('td', { class: 'r' }, h('div', { style: 'display:flex;align-items:center;gap:8px;justify-content:flex-end' }, h('div', { class: 'weight-bar' }, bar), h('span', { class: 'num', text: fmtPct(weight, 1, false) }))),
              );
            })),
          ))),
        card(t('alloc.title'), renderDonut(p)),
      ),
      card(t('bankinv.title'),
        h('div', { class: 'grid-2', style: 'margin-bottom:14px' },
          stat(t('stat.invested'), fmtMoney(data.investments.totalInvested, 'MXN')),
          stat(t('stat.gain'), fmtSigned(data.investments.totalGain, 'MXN'), null, 'pos'),
        ),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...[t('tbl.instrument'), t('tbl.type'), t('tbl.amount'), t('tbl.rate'), t('tbl.maturity'), t('tbl.gainCol')].map((c, i) => h('th', { class: i > 1 ? 'r' : '', text: c })))),
          h('tbody', {}, ...data.investments.investments.map((inv) => h('tr', {},
            h('td', {}, h('b', { text: inv.name })),
            h('td', { text: inv.type }),
            h('td', { class: 'r num', text: fmtMoney(inv.amount, 'MXN') }),
            h('td', { class: 'r num', text: fmtPct(inv.rate, 2, false) }),
            h('td', { class: 'r', text: inv.maturity ? fmtDate(inv.maturity) : t('open') }),
            h('td', { class: 'r num pos', text: fmtSigned(inv.gain, 'MXN') }),
          ))),
        ),
      ),
    );
  }

  function renderDonut(p) {
    const { t, fmtMoney, fmtPct } = window.I18N;
    const r = 41;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const segs = p.allocation.map((a, i) => {
      const len = (a.pct / 100) * circ;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'seg'); c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', String(r));
      c.setAttribute('stroke', PALETTE[i % PALETTE.length]);
      c.setAttribute('stroke-dasharray', `0 ${circ}`);
      c.setAttribute('stroke-dashoffset', String(-offset));
      requestAnimationFrame(() => requestAnimationFrame(() => { c.setAttribute('stroke-dasharray', `${len} ${circ - len}`); }));
      offset += len;
      return c;
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'donut');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', '50'); bg.setAttribute('cy', '50'); bg.setAttribute('r', String(r)); bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'rgba(255,255,255,.06)'); bg.setAttribute('stroke-width', '18');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '50'); label.setAttribute('y', '48'); label.setAttribute('text-anchor', 'middle'); label.textContent = window.I18N.fmtCompact(p.totalValue);
    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', '50'); sub.setAttribute('y', '60'); sub.setAttribute('text-anchor', 'middle'); sub.setAttribute('class', 'sub'); sub.textContent = t('alloc.center').toUpperCase();
    svg.append(bg, ...segs, label, sub);
    return h('div', { class: 'donut-wrap' }, svg,
      h('div', { class: 'alloc-list' }, ...p.allocation.map((a, i) => {
        const hd = p.holdings.find((x) => x.symbol === a.symbol);
        return h('div', { class: 'alloc-row' }, h('i', { style: `background:${PALETTE[i % PALETTE.length]}` }), h('span', { class: 'n', text: `${a.symbol} · ${hd.name}` }), h('b', { class: 'num', text: fmtPct(a.pct, 1, false) }), h('small', { class: 'num', text: fmtMoney(hd.value) }));
      })));
  }

  // ---------- Análisis ----------
  function renderAnalysis(root, data) {
    const { t, fmtMoney, fmtDate, fmtSigned } = window.I18N;
    chartDefaults();
    const spendCanvas = h('canvas');
    const cashCanvas = h('canvas');
    const catIcons = { ingresos: '💵', supermercado: '🛒', restaurantes: '🍽️', entretenimiento: '🎬', servicios: '💡', transporte: '🚗', compras: '🛍️', salud: '⚕️', hogar: '🏠', vivienda: '🏢', ahorro: '🐷', transferencias: '↔️', 'pagos tdc': '💳' };
    root.replaceChildren(
      h('div', { class: 'grid-2' },
        card(t('analysis.spending'), h('div', { class: 'cjs-wrap' }, spendCanvas),
          h('div', { class: 'legend' }, ...data.spending.categories.slice(0, 6).map((c, i) => h('span', {}, h('i', { style: `background:${PALETTE[i % PALETTE.length]}` }), c.category)))),
        card(t('analysis.cashflow'), h('div', { class: 'cjs-wrap' }, cashCanvas),
          h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:#79e0a3' }), t('analysis.income')), h('span', {}, h('i', { style: 'background:#f2a9d3' }), t('analysis.expenses')))),
      ),
      h('div', { class: 'grid-2' },
        card(t('analysis.top'), ...data.spending.categories.slice(0, 6).map((c, i) => {
          const bar = h('i');
          requestAnimationFrame(() => { bar.style.width = `${(c.total / data.spending.categories[0].total) * 100}%`; });
          return h('div', { class: 'alloc-row', style: 'padding:7px 0' }, h('span', { text: catIcons[c.category.toLowerCase()] ?? '💰' }), h('span', { class: 'n', text: c.category }),
            h('div', { class: 'weight-bar', style: 'width:90px' }, bar), h('b', { class: 'num', text: fmtMoney(c.total, 'MXN') }));
        }), h('div', { class: 'field-row', style: 'margin-top:12px' }, h('span', { text: t('analysis.spent') }), h('b', { class: 'num', text: fmtMoney(data.spending.totalSpent, 'MXN') }))),
        card(t('analysis.recent'), ...data.transactions.slice(0, 7).map((tx) => h('div', { class: 'wl-row' },
          h('span', { class: 'logo', text: catIcons[tx.category.toLowerCase()] ?? '💰' }),
          h('span', { class: 'wl-main' }, h('span', { class: 'wl-name truncate', text: tx.description }), h('span', { class: 'wl-sub', text: `${fmtDate(tx.date, 'dayMonth')} · ${tx.category}` })),
          h('span', { class: `wl-price num ${tx.amount >= 0 ? 'pos' : ''}`, text: fmtSigned(tx.amount, 'MXN') })))),
      ),
      card(t('analysis.accounts'), h('div', { class: 'grid-3' }, ...data.accounts.map((a) => stat(a.name, fmtMoney(a.balance, 'MXN'), a.type === 'credit' ? `${t('analysis.available')}: ${fmtMoney(a.availableCredit, 'MXN')}` : a.number, a.balance < 0 ? 'neg' : '')))),
    );
    if (!window.Chart) return;
    analysisCharts.forEach((c) => c.destroy());
    analysisCharts = [];
    const cats = data.spending.categories;
    analysisCharts.push(new window.Chart(spendCanvas, {
      type: 'doughnut',
      data: { labels: cats.map((c) => c.category), datasets: [{ data: cats.map((c) => c.total), backgroundColor: PALETTE, borderColor: '#0f0d11', borderWidth: 2, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', animation: { animateRotate: true, duration: 1200, easing: 'easeOutQuart' }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtMoney(c.parsed, 'MXN')}` } } } },
    }));
    analysisCharts.push(new window.Chart(cashCanvas, {
      type: 'bar',
      data: { labels: data.cashflow.map((m) => m.month), datasets: [
        { label: t('analysis.income'), data: data.cashflow.map((m) => m.income), backgroundColor: '#79e0a3', borderRadius: 8, maxBarThickness: 34 },
        { label: t('analysis.expenses'), data: data.cashflow.map((m) => m.expenses), backgroundColor: '#f2a9d3', borderRadius: 8, maxBarThickness: 34 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 1100, easing: 'easeOutQuart' }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMoney(c.parsed.y, 'MXN')}` } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { callback: (v) => window.I18N.fmtCompact(v) } } } },
    }));
  }

  // ---------- Mercado ----------
  function renderMarket(root, data) {
    const { t, fmtNumber, fmtPct, fmtDate } = window.I18N;
    const cards = data.watchlist.items.map((w, i) => {
      const { line, area } = window.sparklinePaths(w.sparkline);
      const color = w.changePct >= 0 ? '#79e0a3' : '#ff8c9f';
      const svg = h('div', { class: 'mkt-spark', html: `<svg viewBox="0 0 200 44" preserveAspectRatio="none" width="100%" height="44"><path class="area" d="${area}" fill="${color}"/><path class="line" d="${line}" stroke="${color}"/></svg>` });
      return h('button', { type: 'button', class: 'card mkt-card', 'data-anim': 'pop', style: `--i:${i}`, on: { click: () => window.AIPanel.open(t('prompt.holding', { symbol: w.symbol })) } },
        h('div', { class: 'mkt-top' }, logo(w.symbol), h('div', { class: 'wl-main', style: 'text-align:left' }, h('div', { class: 'wl-name', text: w.name }), h('div', { class: 'wl-sub', text: `${w.exchange}: ${w.symbol}` }))),
        svg,
        h('div', { class: 'mkt-bottom' }, h('span', { class: 'p num', text: `$${fmtNumber(w.price)}` }), h('span', { class: `wl-change ${w.changePct >= 0 ? 'pos' : 'neg'}`, style: 'font-size:12.5px', text: fmtPct(w.changePct) })));
    });
    const fx = data.exchangeRates;
    root.replaceChildren(
      h('div', {}, h('h3', { class: 'card-title', style: 'margin:2px 0 12px', text: t('market.watching') }), h('div', { class: 'grid-4' }, ...cards)),
      card(t('market.rates'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Divisa' }), h('th', { class: 'r', text: t('market.buy') }), h('th', { class: 'r', text: t('market.sell') }))),
          h('tbody', {}, ...fx.rates.map((r) => h('tr', {}, h('td', {}, h('b', { text: r.currency }), h('span', { class: 'muted', style: 'margin-left:8px;font-size:12px', text: r.name })), h('td', { class: 'r num', text: `$${fmtNumber(r.buy, 2)}` }), h('td', { class: 'r num', text: `$${fmtNumber(r.sell, 2)}` }))))),
        h('div', { class: 'muted', style: 'font-size:11.5px;margin-top:10px', text: `${t('market.updated')}: ${fmtDate(fx.updatedAt, 'longTime')} · MXN` })),
    );
  }

  // ---------- Herramientas ----------
  function renderTools(root, data) {
    const { t, fmtMoney, fmtPct, fmtNumber } = window.I18N;
    const products = data.creditProducts;
    if (!products.length) {
      root.replaceChildren(card(t('tools.credit'), h('div', { class: 'empty', text: '—' })));
      return;
    }
    const defaultProduct = products.find((p) => p.id === 'CRED-AUTO') ?? products[0];
    const sim = { productId: defaultProduct.id, amount: Math.min(350000, defaultProduct.maxAmount), months: Math.min(48, defaultProduct.maxMonths) };
    const productSel = h('select', {}, ...products.map((p) => h('option', { value: p.id, text: p.name })));
    productSel.value = sim.productId;
    const amountRange = h('input', { type: 'range', min: '10000', step: '5000' });
    const amountInput = h('input', { type: 'number', min: '10000', step: '1000' });
    const monthsRange = h('input', { type: 'range', min: '6', step: '6' });
    const monthsLabel = h('b');
    const results = {
      monthly: h('div', { class: 'v accent num skeleton', text: '—' }), rate: h('div', { class: 'v num skeleton', text: '—' }),
      total: h('div', { class: 'v num skeleton', text: '—' }), interest: h('div', { class: 'v num skeleton', text: '—' }),
    };
    const errorEl = h('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;color:var(--red)' });
    let timer = null;
    const product = () => products.find((p) => p.id === sim.productId) ?? products[0];
    const syncLimits = () => {
      const p = product();
      amountRange.max = String(p.maxAmount); amountInput.max = String(p.maxAmount); monthsRange.max = String(p.maxMonths);
      sim.amount = Math.min(sim.amount, p.maxAmount); sim.months = Math.min(sim.months, p.maxMonths);
      amountRange.value = String(sim.amount); amountInput.value = String(sim.amount); monthsRange.value = String(sim.months);
      monthsLabel.textContent = `${sim.months} ${t('tools.months.unit')}`;
    };
    const compute = () => {
      clearTimeout(timer);
      Object.values(results).forEach((el) => el.classList.add('skeleton'));
      timer = setTimeout(async () => {
        try {
          const r = await window.API.simulateCredit(sim);
          results.monthly.textContent = fmtMoney(r.monthlyPayment, 'MXN');
          results.rate.textContent = fmtPct(r.annualRate, 2, false);
          results.total.textContent = fmtMoney(r.totalPayment, 'MXN');
          results.interest.textContent = fmtMoney(r.totalInterest, 'MXN');
          errorEl.textContent = '';
        } catch (err) {
          errorEl.textContent = err.message;
        } finally {
          Object.values(results).forEach((el) => el.classList.remove('skeleton'));
        }
      }, 250);
    };
    productSel.addEventListener('change', () => { sim.productId = productSel.value; syncLimits(); compute(); });
    amountRange.addEventListener('input', () => { sim.amount = Number(amountRange.value); amountInput.value = amountRange.value; compute(); });
    amountInput.addEventListener('change', () => { sim.amount = Math.max(10000, Math.min(product().maxAmount, Number(amountInput.value) || 10000)); syncLimits(); compute(); });
    monthsRange.addEventListener('input', () => { sim.months = Number(monthsRange.value); monthsLabel.textContent = `${sim.months} ${t('tools.months.unit')}`; compute(); });
    syncLimits();

    // Convertidor de divisas (JPY cotiza por 100 unidades).
    const fx = data.exchangeRates;
    const currencies = ['MXN', ...fx.rates.map((r) => r.currency)];
    const toMxn = (amount, cur) => { if (cur === 'MXN') return amount; const r = fx.rates.find((x) => x.currency === cur); return (amount * r.buy) / (cur === 'JPY' ? 100 : 1); };
    const fromMxn = (mxn, cur) => { if (cur === 'MXN') return mxn; const r = fx.rates.find((x) => x.currency === cur); return (mxn / r.sell) * (cur === 'JPY' ? 100 : 1); };
    const fxAmount = h('input', { type: 'number', min: '0', step: '100', value: '1000' });
    const fromSel = h('select', {}, ...currencies.map((c) => h('option', { value: c, text: c })));
    const toSel = h('select', {}, ...currencies.map((c) => h('option', { value: c, text: c })));
    fromSel.value = 'USD'; toSel.value = 'MXN';
    const fxResult = h('div', { class: 'v num', style: 'font-size:24px' });
    const fxRate = h('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' });
    const convert = () => {
      const amount = Number(fxAmount.value) || 0;
      const out = fromMxn(toMxn(amount, fromSel.value), toSel.value);
      fxResult.textContent = `${fmtNumber(out, 2)} ${toSel.value}`;
      const unit = fromMxn(toMxn(1, fromSel.value), toSel.value);
      fxRate.textContent = `1 ${fromSel.value} = ${fmtNumber(unit, 4)} ${toSel.value}`;
    };
    [fxAmount, fromSel, toSel].forEach((el) => el.addEventListener('input', convert));
    const swapBtn = h('button', { type: 'button', class: 'round-btn', title: 'Swap', html: icon('swap'), on: { click: () => { const a = fromSel.value; fromSel.value = toSel.value; toSel.value = a; convert(); } } });
    convert();

    root.replaceChildren(
      h('div', { class: 'grid-2' },
        card(null,
          h('div', { class: 'card-head' }, h('div', {}, h('h3', { class: 'card-title', text: t('tools.credit') }), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px', text: t('tools.credit.sub') }))),
          h('div', { style: 'display:flex;flex-direction:column;gap:14px' },
            h('div', { class: 'field' }, h('label', { text: t('tools.product') }), productSel),
            h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('label', { text: t('tools.amount') })), amountInput, amountRange),
            h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('label', { text: t('tools.months') }), monthsLabel), monthsRange),
            h('div', { class: 'result-box' },
              h('div', {}, h('div', { class: 'k', text: t('tools.monthly') }), results.monthly), h('div', {}, h('div', { class: 'k', text: t('tools.rate') }), results.rate),
              h('div', {}, h('div', { class: 'k', text: t('tools.totalPay') }), results.total), h('div', {}, h('div', { class: 'k', text: t('tools.interest') }), results.interest)),
            errorEl)),
        h('div', { class: 'col-stack' },
          card(null,
            h('div', { class: 'card-head' }, h('div', {}, h('h3', { class: 'card-title', text: t('tools.fx') }), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px', text: t('tools.fx.sub') })), swapBtn),
            h('div', { style: 'display:flex;flex-direction:column;gap:14px' },
              h('div', { class: 'field' }, h('label', { text: t('tools.amount') }), fxAmount),
              h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', { text: t('tools.from') }), fromSel), h('div', { class: 'field' }, h('label', { text: t('tools.to') }), toSel)),
              h('div', { class: 'result-box', style: 'grid-template-columns:1fr' }, h('div', {}, fxResult, fxRate)))),
          card(null,
            h('div', { class: 'card-head' }, h('div', {}, h('h3', { class: 'card-title', text: t('tools.transfer') }), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px', text: t('tools.transfer.sub') }))),
            h('button', { type: 'button', class: 'btn', text: t('tools.transfer.cta'), on: { click: () => window.AIPanel.open(t('prompt.transfer')) } })))),
    );
    compute();
  }

  // ---------- Comunidad ----------
  const POSTS = {
    es: [
      { who: 'Ana Sofía Torres', ini: 'AT', h: 2, tags: ['NVDA', 'IA'], text: 'NVDA sigue liderando el rally de semiconductores. Con +2% hoy, mantengo mi posición pero tomé utilidades parciales para rebalancear hacia deuda gubernamental.', likes: 128 },
      { who: 'Carlos Mendoza', ini: 'CM', h: 5, tags: ['Pagarés', 'Tasas'], text: 'Con Banxico manteniendo tasas altas, los pagarés a 28 días siguen dando más de 9% anual. Buen momento para la parte conservadora del portafolio.', likes: 86 },
      { who: 'Norte AI · Análisis', ini: 'N', h: 9, tags: ['Portafolio', 'Riesgo'], text: 'Tu portafolio concentra 53% en AAPL. Diversificar 10–15% hacia MSFT o un ETF del S&P 500 reduciría la volatilidad sin sacrificar rendimiento esperado.', likes: 214 },
      { who: 'Luis Herrera', ini: 'LH', h: 26, tags: ['SPOT'], text: 'Spotify reportó márgenes récord en suscripciones. Lo agregué a mi lista de seguimiento esperando una entrada por debajo de $330.', likes: 41 },
    ],
    en: [
      { who: 'Ana Sofía Torres', ini: 'AT', h: 2, tags: ['NVDA', 'AI'], text: 'NVDA keeps leading the semiconductor rally. Up 2% today; I am holding but took partial profits to rebalance into government bonds.', likes: 128 },
      { who: 'Carlos Mendoza', ini: 'CM', h: 5, tags: ['Notes', 'Rates'], text: 'With Banxico keeping rates high, 28-day notes still pay over 9% a year. Good moment for the conservative side of the portfolio.', likes: 86 },
      { who: 'Norte AI · Analysis', ini: 'N', h: 9, tags: ['Portfolio', 'Risk'], text: 'Your portfolio is 53% concentrated in AAPL. Diversifying 10–15% into MSFT or an S&P 500 ETF would cut volatility without giving up expected return.', likes: 214 },
      { who: 'Luis Herrera', ini: 'LH', h: 26, tags: ['SPOT'], text: 'Spotify posted record subscription margins. Added it to my watchlist waiting for an entry below $330.', likes: 41 },
    ],
  };
  function renderCommunity(root) {
    const { t, lang } = window.I18N;
    const posts = POSTS[lang] ?? POSTS.es;
    root.replaceChildren(card(null, ...posts.map((p) => {
      let liked = false;
      const count = h('span', { text: String(p.likes) });
      const likeBtn = h('button', { type: 'button', class: 'pill pill-xs', html: `${icon('heart')} ` }, count);
      likeBtn.addEventListener('click', () => { liked = !liked; likeBtn.classList.toggle('is-active', liked); count.textContent = String(p.likes + (liked ? 1 : 0)); });
      const followBtn = h('button', { type: 'button', class: 'pill pill-xs', text: t('community.follow'), on: { click: (e) => e.currentTarget.classList.toggle('is-active') } });
      const when = p.h < 24 ? t('notif.h', { n: p.h }) : t('notif.d', { n: Math.round(p.h / 24) });
      return h('div', { class: 'post' }, h('span', { class: 'avatar', text: p.ini }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'post-head' }, h('b', { text: p.who }), h('small', { text: when }), ...p.tags.map((tag) => h('span', { class: 'tag', text: tag }))),
          h('p', { text: p.text }), h('div', { class: 'post-actions' }, likeBtn, followBtn)));
    })));
  }

  window.Views = { renderPortfolio, renderAnalysis, renderMarket, renderTools, renderCommunity, h };
})();

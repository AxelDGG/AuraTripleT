// Renderer de UI generativa: convierte la especificación JSON del agente
// en DOM real. Todo se construye con createElement/textContent para que
// el contenido generado por el LLM nunca se inyecte como HTML.

(function () {
  const fmtMoney = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

  const CATEGORY_ICONS = {
    ingresos: '💵', supermercado: '🛒', restaurantes: '🍽️', entretenimiento: '🎬',
    servicios: '💡', transporte: '🚗', compras: '🛍️', salud: '⚕️', hogar: '🏠',
    vivienda: '🏢', ahorro: '🐷', transferencias: '↔️', 'pagos tdc': '💳',
  };

  // La paleta, los ejes y el dibujo de toda gráfica viven en js/charts.js,
  // que expone window.NorteCharts. Aquí solo se arma la tarjeta que la envuelve.

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  // Mini-markdown seguro: soporta **negritas** y `código` sin innerHTML crudo.
  function renderMarkdown(target, md) {
    const parts = String(md).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        target.appendChild(el('strong', null, part.slice(2, -2)));
      } else if (part.startsWith('`') && part.endsWith('`')) {
        target.appendChild(el('code', null, part.slice(1, -1)));
      } else if (part) {
        target.appendChild(document.createTextNode(part));
      }
    }
  }

  const renderers = {
    header(c) {
      const wrap = el('div', 'c-header gen');
      if (c.badge) wrap.appendChild(el('span', 'badge', c.badge));
      wrap.appendChild(el('h1', null, c.title ?? ''));
      if (c.subtitle) wrap.appendChild(el('p', null, c.subtitle));
      return wrap;
    },

    kpi_grid(c) {
      const grid = el('div', 'c-kpis gen');
      for (const item of c.items ?? []) {
        const kpi = el('div', 'kpi');
        const label = el('div', 'k-label');
        if (item.icon) label.appendChild(el('span', null, item.icon));
        label.appendChild(el('span', null, item.label ?? ''));
        kpi.appendChild(label);
        kpi.appendChild(el('div', 'k-value', item.value ?? ''));
        if (item.delta) {
          kpi.appendChild(el('div', `k-delta ${item.trend ?? 'neutral'}`, item.delta));
        }
        grid.appendChild(kpi);
      }
      return grid;
    },

    balance_cards(c) {
      const grid = el('div', 'c-balances gen');
      for (const a of c.accounts ?? []) {
        const kind = ['checking', 'savings', 'credit'].includes(a.kind) ? a.kind : 'checking';
        const card = el('div', `acct ${kind}`);
        const top = el('div');
        top.appendChild(el('div', 'a-name', a.name ?? 'Cuenta'));
        if (a.number) top.appendChild(el('div', 'a-num', a.number));
        card.appendChild(top);
        const bottom = el('div');
        const bal = typeof a.balance === 'number' ? fmtMoney(a.balance) : (a.balance ?? '');
        bottom.appendChild(el('div', 'a-bal', bal));
        if (a.extra) bottom.appendChild(el('div', 'a-extra', a.extra));
        card.appendChild(bottom);
        grid.appendChild(card);
      }
      return grid;
    },

    // El dibujo lo resuelve NorteCharts según chartType; aquí va la tarjeta.
    chart(c) {
      const card = el('div', 'card c-chart gen');
      if (c.title) card.appendChild(el('h3', null, c.title));
      if (c.subtitle) card.appendChild(el('p', 'ch-sub', c.subtitle));
      if (window.NorteCharts) {
        card.appendChild(window.NorteCharts.create(c));
      } else {
        card.appendChild(el('p', 'ch-sub', 'No se pudo cargar el motor de gráficas.'));
      }
      if (c.caption) card.appendChild(el('div', 'ch-cap', c.caption));
      return card;
    },

    table(c) {
      const card = el('div', 'card c-table gen');
      if (c.title) card.appendChild(el('h3', null, c.title));
      const table = el('table');
      const thead = el('thead');
      const headRow = el('tr');
      for (const col of c.columns ?? []) headRow.appendChild(el('th', null, col));
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = el('tbody');
      for (const row of c.rows ?? []) {
        const tr = el('tr');
        for (const cell of row) tr.appendChild(el('td', null, cell));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      card.appendChild(table);
      return card;
    },
  };

  renderers.transaction_list = function (c) {
    const card = el('div', 'card gen');
    if (c.title) card.appendChild(el('h3', null, c.title));
    for (const t of c.items ?? []) {
      const row = el('div', 'tx');
      const icon = CATEGORY_ICONS[(t.category ?? '').toLowerCase()] ?? '💰';
      row.appendChild(el('div', 't-icon', icon));
      const main = el('div', 't-main');
      main.appendChild(el('div', 't-desc', t.description ?? ''));
      main.appendChild(el('div', 't-meta', [t.date, t.category].filter(Boolean).join(' · ')));
      row.appendChild(main);
      const amount = Number(t.amount ?? 0);
      const amt = el('div', `t-amt ${amount >= 0 ? 'pos' : 'neg'}`,
        `${amount >= 0 ? '+' : ''}${fmtMoney(amount)}`);
      row.appendChild(amt);
      card.appendChild(row);
    }
    return card;
  };

  renderers.form = function (c) {
    const card = el('div', 'card c-form gen');
    if (c.title) card.appendChild(el('h3', null, c.title));
    if (c.description) card.appendChild(el('p', 'f-desc', c.description));
    const form = el('form');
    form.dataset.action = c.action ?? 'accion';
    const grid = el('div', 'f-grid');
    // Tolerante a variaciones del LLM: acepta inputType o type, y options
    // como objetos {value,label} o strings simples.
    const fields = c.fields ?? c.inputs ?? [];
    for (const f of fields) {
      const field = el('div', 'f-field');
      field.appendChild(el('label', null, f.label ?? f.name ?? ''));
      const kind = f.inputType ?? f.type ?? (Array.isArray(f.options) && f.options.length ? 'select' : 'text');
      let input;
      if (kind === 'select') {
        input = el('select');
        for (const opt of f.options ?? []) {
          const isObj = opt && typeof opt === 'object';
          const o = el('option', null, isObj ? (opt.label ?? opt.value ?? '') : String(opt));
          o.value = isObj ? (opt.value ?? '') : String(opt);
          input.appendChild(o);
        }
      } else {
        input = el('input');
        input.type = kind === 'number' ? 'number' : 'text';
        if (input.type === 'number') { input.step = 'any'; input.min = '0'; }
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.name = f.name ?? '';
      if (f.value !== undefined && f.value !== null) input.value = f.value;
      field.appendChild(input);
      grid.appendChild(field);
    }
    form.appendChild(grid);
    const submit = el('button', 'f-submit', c.submitLabel ?? 'Enviar');
    submit.type = 'submit';
    form.appendChild(submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const pairs = [...data.entries()]
        .filter(([, v]) => String(v).trim() !== '')
        .map(([k, v]) => `${k}=${String(v).trim()}`);
      submit.disabled = true;
      window.dispatchEvent(new CustomEvent('genui:form-submit', {
        detail: { action: form.dataset.action, payload: pairs.join(', ') },
      }));
    });
    card.appendChild(form);
    return card;
  };

  renderers.alert = function (c) {
    const level = ['info', 'success', 'warning', 'error'].includes(c.level) ? c.level : 'info';
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '⛔' };
    const wrap = el('div', `c-alert ${level} gen`);
    wrap.appendChild(el('span', 'al-icon', icons[level]));
    const body = el('div');
    if (c.title) body.appendChild(el('b', null, c.title));
    body.appendChild(el('span', null, c.text ?? ''));
    wrap.appendChild(body);
    return wrap;
  };

  renderers.progress = function (c) {
    const card = el('div', 'card c-progress gen');
    const value = Math.max(0, Math.min(100, Number(c.value ?? 0)));
    const head = el('div', 'p-head');
    head.appendChild(el('span', null, c.label ?? ''));
    head.appendChild(el('span', null, `${Math.round(value)}%`));
    card.appendChild(head);
    const track = el('div', 'p-track');
    const fill = el('div', 'p-fill');
    fill.style.width = '0%';
    track.appendChild(fill);
    card.appendChild(track);
    if (c.caption) card.appendChild(el('div', 'p-cap', c.caption));
    requestAnimationFrame(() => { fill.style.width = `${value}%`; });
    return card;
  };

  renderers.text = function (c) {
    const card = el('div', 'card c-text gen');
    renderMarkdown(card, c.markdown ?? c.text ?? '');
    return card;
  };

  // Miniatura del carrusel: silueta estática en SVG, sin Chart.js ni animación.
  // Cada tipo conserva su forma (barras, línea, arco, celdas) para que la
  // tarjeta del historial se reconozca a escala 0.32.
  function miniChart(c) {
    const card = el('div', 'card gen');
    if (c.title) card.appendChild(el('h3', null, c.title));
    if (window.NorteCharts) card.appendChild(window.NorteCharts.createPreview(c));
    return card;
  }

  // `preview: true` produce la versión ligera y sin interacción que va dentro de
  // las tarjetas del carrusel.
  window.renderGeneratedUi = function (container, components, { preview = false } = {}) {
    container.replaceChildren();
    let delay = 0;
    for (const comp of components ?? []) {
      const renderFn = preview && comp?.type === 'chart' ? miniChart : renderers[comp?.type];
      if (!renderFn) continue;
      try {
        const node = renderFn(comp);
        if (!preview) {
          node.style.animationDelay = `${delay}ms`;
          delay += 90;
        }
        container.appendChild(node);
      } catch (err) {
        console.error('Error renderizando componente', comp?.type, err);
      }
    }
    if (!container.children.length && !preview) {
      container.appendChild(renderers.alert({
        level: 'warning',
        text: 'El agente respondió pero no generó componentes visuales.',
      }));
    }
  };
})();

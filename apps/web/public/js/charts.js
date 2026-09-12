// Motor de gráficas de Norte.
//
// Adopta el vocabulario de Bklit UI (https://bklit.com/docs): mismos tipos de
// gráfica, mismos tokens de color (--chart-1..8, --chart-grid, --chart-track) y
// sus proporciones por defecto (área con gradiente 0.4→0, trazo de 2px, gauge de
// 270° con muescas). Bklit se distribuye como registry de shadcn/ui (React +
// visx, solo por npm), así que aquí está portado a la capa vanilla del proyecto:
// Chart.js para lo cartesiano y SVG propio para lo que Chart.js no cubre
// (gauge, ring, funnel, heatmap).
//
// Se mantiene la regla del renderer: nada de innerHTML. Todo se construye con
// createElement/createElementNS y textContent.

(function () {
  'use strict';

  const FALLBACKS = {
    '--chart-1': '#eb0029', '--chart-2': '#1b1b20', '--chart-3': '#e2758a', '--chart-4': '#1f5fbf',
    '--chart-5': '#b8770a', '--chart-6': '#0f8f4d', '--chart-7': '#6e6e7a', '--chart-8': '#9e0018',
    '--chart-grid': 'rgba(20, 20, 28, 0.08)', '--chart-axis': '#6e6e7a',
    '--chart-track': '#e9e9ee', '--chart-positive': '#0f8f4d', '--chart-negative': '#eb0029',
    '--font': "'Manrope', system-ui, sans-serif",
  };

  const varCache = new Map();
  function cssVar(name) {
    if (!varCache.has(name)) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      varCache.set(name, value || FALLBACKS[name] || '#eb0029');
    }
    return varCache.get(name);
  }
  const palette = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--chart-${i}`));

  // rgba() a partir de un token hex; si el token viene en otro formato se
  // devuelve tal cual (Chart.js lo acepta, solo pierde la transparencia).
  function withAlpha(color, alpha) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) return color;
    let hex = match[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function mix(from, to, t) {
    const parse = (c) => {
      let hex = String(c).replace('#', '');
      if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const k = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(r1 + (r2 - r1) * k)}, ${Math.round(g1 + (g2 - g1) * k)}, ${Math.round(b1 + (b2 - b1) * k)})`;
  }

  // ---------- Formato de cifras ----------
  const MONEY = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  const MONEY_SHORT = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 });
  const NUM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
  const NUM_SHORT = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
  // Los ejes no necesitan centavos; el tooltip sí los da.
  const MONEY_PLAIN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  // `format` decide cómo se leen los valores en ejes, tooltips y etiquetas.
  // Por omisión es moneda: casi todo lo que grafica el agente son pesos.
  function formatter(spec) {
    const kind = spec.format || 'currency';
    const suffix = spec.unit ? ` ${spec.unit}` : '';
    return {
      full(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '';
        if (kind === 'currency') return MONEY.format(n);
        if (kind === 'percent') return `${NUM.format(n)}%`;
        if (kind === 'compact') return NUM_SHORT.format(n) + suffix;
        return NUM.format(n) + suffix;
      },
      // Escala completa: el pico decide si TODAS las etiquetas se abrevian, para
      // que un mismo eje no mezcle $20 k con $8,000.00.
      scaled(peak) {
        const short = Math.abs(Number(peak) || 0) >= 10000;
        const money = short ? MONEY_SHORT : MONEY_PLAIN;
        return (v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return '';
          if (kind === 'currency') return money.format(n);
          if (kind === 'percent') return `${NUM_SHORT.format(n)}%`;
          return NUM_SHORT.format(n) + suffix;
        };
      },
      axis(v) {
        return this.scaled(v)(v);
      },
    };
  }

  // ---------- Helpers DOM ----------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key of Object.keys(attrs || {})) node.setAttribute(key, String(attrs[key]));
    return node;
  }
  function svgText(x, y, text, attrs) {
    const node = svgEl('text', Object.assign({ x, y }, attrs || {}));
    node.textContent = String(text);
    return node;
  }
  const polar = (cx, cy, r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  // ---------- Normalización de datos ----------
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const series = (spec) => (Array.isArray(spec.datasets) ? spec.datasets : []);
  const rawData = (dataset) => (Array.isArray(dataset && dataset.data) ? dataset.data : []);
  const numbers = (dataset) => rawData(dataset).map((v) => (v && typeof v === 'object' ? num(v.y != null ? v.y : v.value) : num(v)));
  const seriesColor = (dataset, i) => (dataset && dataset.color) || palette()[i % 8];

  const ALIASES = {
    donut: 'doughnut', dona: 'doughnut', column: 'bar', columna: 'bar', barras: 'bar',
    barh: 'horizontal_bar', horizontalbar: 'horizontal_bar', stacked: 'stacked_bar',
    apilada: 'stacked_bar', progress_ring: 'ring', anillo: 'ring', velas: 'candlestick',
    embudo: 'funnel', calor: 'heatmap', mapa_calor: 'heatmap', medidor: 'gauge',
    mixed: 'composed', mixta: 'composed', pnl: 'profit_loss',
  };
  const CARTESIAN = ['bar', 'stacked_bar', 'horizontal_bar', 'line', 'area', 'composed', 'scatter', 'candlestick', 'profit_loss'];
  const CIRCULAR = ['pie', 'doughnut', 'radar'];
  const CUSTOM = ['gauge', 'ring', 'funnel', 'heatmap'];
  const TYPES = CARTESIAN.concat(CIRCULAR, CUSTOM);

  function resolveType(spec) {
    const raw = String((spec && spec.chartType) || '').toLowerCase().trim();
    const type = ALIASES[raw] || raw;
    return TYPES.includes(type) ? type : 'bar';
  }

  // ---------- Chart.js: configuración común ----------
  function ensureDefaults() {
    if (!window.Chart || ensureDefaults.done) return;
    Chart.defaults.font.family = cssVar('--font');
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('--chart-axis');
    Chart.defaults.animation.duration = 900;
    Chart.defaults.animation.easing = 'easeOutQuart';
    ensureDefaults.done = true;
  }

  const legendBlock = (display) => ({
    display,
    position: 'bottom',
    labels: {
      color: cssVar('--chart-axis'), boxWidth: 12, boxHeight: 12,
      usePointStyle: true, pointStyle: 'circle', padding: 14,
    },
  });

  function tooltipBlock(fmt, extra) {
    return Object.assign({
      backgroundColor: cssVar('--chart-2'),
      padding: 10,
      cornerRadius: 8,
      boxWidth: 8,
      boxHeight: 8,
      usePointStyle: true,
      titleFont: { weight: '700' },
      callbacks: {
        label: (ctx) => {
          const name = ctx.dataset && ctx.dataset.label ? ctx.dataset.label : ctx.label;
          const parsed = ctx.parsed;
          const v = parsed && typeof parsed === 'object' ? (parsed.y != null ? parsed.y : parsed.x) : parsed;
          return ` ${name}: ${fmt.full(v)}`;
        },
      },
    }, extra || {});
  }

  // Eje de valores (usa el formateador) y eje de categorías (no lo usa).
  function cartesianScales(spec, fmt, type) {
    const horizontal = type === 'horizontal_bar';
    const stacked = type === 'stacked_bar' || spec.stacked === true;
    const valueAxis = {
      stacked,
      beginAtZero: type !== 'scatter' && type !== 'candlestick',
      border: { display: false },
      ticks: {
        color: cssVar('--chart-axis'),
        padding: 6,
        callback(v, i, ticks) {
          const peak = Math.max(...ticks.map((t) => Math.abs(t.value)));
          return fmt.scaled(peak)(v);
        },
      },
      grid: {
        drawTicks: false,
        // En utilidad/pérdida el cero es la referencia que se lee primero.
        color: type === 'profit_loss'
          ? (ctx) => (ctx.tick && ctx.tick.value === 0 ? withAlpha(cssVar('--chart-2'), 0.4) : cssVar('--chart-grid'))
          : cssVar('--chart-grid'),
      },
    };
    const categoryAxis = {
      stacked,
      border: { display: false },
      ticks: { color: cssVar('--chart-axis'), padding: 6, maxRotation: 0, autoSkipPadding: 12 },
      grid: { display: false, drawTicks: false },
    };
    if (type === 'scatter') {
      return { x: Object.assign({}, valueAxis, { beginAtZero: false }), y: valueAxis };
    }
    const scales = horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis };
    // Segundo eje solo si alguna serie lo pide (p. ej. pesos contra porcentaje).
    if (series(spec).some((d) => d.axis === 'right')) {
      scales.y1 = Object.assign({}, valueAxis, {
        position: 'right',
        grid: { display: false, drawTicks: false },
        ticks: { color: cssVar('--chart-axis'), padding: 6, callback: (v) => NUM_SHORT.format(v) },
      });
    }
    return scales;
  }

  // Gradiente del área: 0.4 arriba → 0 abajo, el default de Bklit.
  function areaFill(color) {
    return (ctx) => {
      const area = ctx.chart.chartArea;
      if (!area) return withAlpha(color, 0.18);
      const grad = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      grad.addColorStop(0, withAlpha(color, 0.4));
      grad.addColorStop(1, withAlpha(color, 0));
      return grad;
    };
  }

  // Relleno bicolor partido en el cero, para utilidad/pérdida.
  function signedFill(ctx) {
    const area = ctx.chart.chartArea;
    if (!area) return 'transparent';
    const pos = cssVar('--chart-positive');
    const neg = cssVar('--chart-negative');
    const height = area.bottom - area.top;
    const scale = ctx.chart.scales.y;
    let zero = scale ? scale.getPixelForValue(0) : area.bottom;
    zero = Math.min(area.bottom, Math.max(area.top, zero));
    const t = height ? (zero - area.top) / height : 1;
    const grad = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    grad.addColorStop(0, withAlpha(pos, 0.38));
    grad.addColorStop(Math.max(0, t - 0.0001), withAlpha(pos, 0.04));
    grad.addColorStop(Math.min(1, t + 0.0001), withAlpha(neg, 0.04));
    grad.addColorStop(1, withAlpha(neg, 0.38));
    return grad;
  }

  // Línea de referencia (meta, presupuesto, promedio) como serie punteada.
  function targetDataset(spec, length) {
    const target = Number(spec.target);
    if (!Number.isFinite(target) || !spec.target) return null;
    return {
      type: 'line',
      label: spec.targetLabel || 'Meta',
      data: new Array(Math.max(1, length)).fill(target),
      borderColor: withAlpha(cssVar('--chart-2'), 0.45),
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      order: -1,
    };
  }

  // ---------- Constructores de datasets ----------
  function cartesianDatasets(spec, type) {
    const list = series(spec);
    const out = list.map((d, i) => {
      const color = seriesColor(d, i);
      // En una gráfica mixta cada serie declara su forma; fuera de ahí manda el tipo.
      const kind = type === 'composed' ? (d.kind || (i === 0 ? 'bar' : 'line')) : type;
      const isLine = kind === 'line' || kind === 'area' || kind === 'profit_loss';
      const base = {
        label: d.label || `Serie ${i + 1}`,
        data: numbers(d),
        borderColor: color,
        borderWidth: 2,
        yAxisID: d.axis === 'right' ? 'y1' : 'y',
      };
      if (!isLine) {
        return Object.assign(base, {
          type: type === 'composed' ? 'bar' : undefined,
          backgroundColor: withAlpha(color, 0.88),
          hoverBackgroundColor: color,
          borderWidth: 0,
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: 54,
        });
      }
      const filled = kind === 'area' || d.kind === 'area' || spec.fill === true;
      return Object.assign(base, {
        type: type === 'composed' ? 'line' : undefined,
        tension: 0.35,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        fill: filled ? 'origin' : false,
        backgroundColor: filled ? areaFill(color) : 'transparent',
      });
    });
    const target = targetDataset(spec, (spec.labels || []).length);
    if (target) out.push(target);
    return out;
  }

  function circularDatasets(spec, type) {
    const list = series(spec);
    if (type === 'radar') {
      return list.map((d, i) => {
        const color = seriesColor(d, i);
        return {
          label: d.label || `Serie ${i + 1}`,
          data: numbers(d),
          borderColor: color,
          borderWidth: 2,
          backgroundColor: withAlpha(color, 0.18),
          pointBackgroundColor: color,
          pointBorderColor: '#ffffff',
          pointRadius: 3,
        };
      });
    }
    return list.slice(0, 1).map((d) => ({
      label: d.label || '',
      data: numbers(d),
      backgroundColor: rawData(d).map((_, i) => (Array.isArray(spec.colors) && spec.colors[i]) || palette()[i % 8]),
      borderColor: '#ffffff',
      borderWidth: 2,
      hoverOffset: 8,
    }));
  }

  function scatterDatasets(spec) {
    return series(spec).map((d, i) => {
      const color = seriesColor(d, i);
      return {
        label: d.label || `Serie ${i + 1}`,
        data: rawData(d).map((p, j) => (p && typeof p === 'object'
          ? { x: num(p.x), y: num(p.y), r: p.r != null ? num(p.r) : undefined }
          : { x: j, y: num(p) })),
        backgroundColor: withAlpha(color, 0.72),
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: (ctx) => (ctx.raw && ctx.raw.r ? Math.max(3, Math.min(22, ctx.raw.r)) : 5),
        pointHoverRadius: (ctx) => (ctx.raw && ctx.raw.r ? Math.max(5, Math.min(24, ctx.raw.r + 2)) : 7),
      };
    });
  }

  // Velas: mecha [min,max] y cuerpo [apertura,cierre] como barras flotantes
  // superpuestas (grouped:false), que es lo que Chart.js permite sin plugin.
  function candleDatasets(spec) {
    const candles = rawData(series(spec)[0]).map((k) => ({
      o: num(k && (k.o != null ? k.o : k.open)),
      h: num(k && (k.h != null ? k.h : k.high)),
      l: num(k && (k.l != null ? k.l : k.low)),
      c: num(k && (k.c != null ? k.c : k.close)),
    }));
    const up = cssVar('--chart-positive');
    const down = cssVar('--chart-negative');
    const color = (i) => (candles[i].c >= candles[i].o ? up : down);
    return [
      {
        label: 'Rango',
        data: candles.map((k) => [k.l, k.h]),
        backgroundColor: candles.map((_, i) => withAlpha(color(i), 0.55)),
        grouped: false,
        barPercentage: 0.08,
        categoryPercentage: 0.98,
        borderRadius: 2,
        borderSkipped: false,
      },
      {
        label: 'Cuerpo',
        data: candles.map((k) => [k.o, k.c]),
        backgroundColor: candles.map((_, i) => color(i)),
        grouped: false,
        barPercentage: 0.5,
        categoryPercentage: 0.98,
        borderRadius: 2,
        borderSkipped: false,
        candles,
      },
    ];
  }

  function profitLossDatasets(spec) {
    const pos = cssVar('--chart-positive');
    const neg = cssVar('--chart-negative');
    return series(spec).slice(0, 1).map((d) => ({
      label: d.label || 'Resultado',
      data: numbers(d),
      borderWidth: 2,
      borderColor: pos,
      // El tramo se pinta del color del punto al que llega.
      segment: { borderColor: (ctx) => (ctx.p1.parsed.y >= 0 ? pos : neg) },
      pointRadius: 0,
      pointHoverRadius: 4,
      pointBackgroundColor: (ctx) => (num(ctx.raw) >= 0 ? pos : neg),
      tension: 0.3,
      cubicInterpolationMode: 'monotone',
      fill: 'origin',
      backgroundColor: signedFill,
    }));
  }

  // ---------- Gráficas Chart.js ----------
  const CHARTJS_BASE = {
    bar: 'bar', stacked_bar: 'bar', horizontal_bar: 'bar', composed: 'bar', candlestick: 'bar',
    line: 'line', area: 'line', profit_loss: 'line',
    scatter: 'scatter', pie: 'pie', doughnut: 'doughnut', radar: 'radar',
  };

  function buildChartJs(spec, type) {
    const fmt = formatter(spec);
    const isCircular = type === 'pie' || type === 'doughnut';
    let datasets;
    if (type === 'scatter') datasets = scatterDatasets(spec);
    else if (type === 'candlestick') datasets = candleDatasets(spec);
    else if (type === 'profit_loss') datasets = profitLossDatasets(spec);
    else if (isCircular || type === 'radar') datasets = circularDatasets(spec, type);
    else datasets = cartesianDatasets(spec, type);

    const showLegend = spec.legend != null
      ? spec.legend !== false
      : isCircular || datasets.filter((d) => !d.candles).length > 1;

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: type === 'horizontal_bar' ? 'y' : 'x',
      interaction: { mode: isCircular || type === 'radar' ? 'nearest' : 'index', intersect: false },
      layout: { padding: { top: 4, right: 4, bottom: 0, left: 0 } },
      plugins: {
        legend: legendBlock(showLegend && type !== 'candlestick'),
        tooltip: tooltipBlock(fmt, type === 'candlestick' ? {
          filter: (ctx) => ctx.datasetIndex === 1,
          callbacks: {
            label: (ctx) => {
              const k = ctx.dataset.candles[ctx.dataIndex];
              return [` Apertura: ${fmt.full(k.o)}`, ` Máximo: ${fmt.full(k.h)}`, ` Mínimo: ${fmt.full(k.l)}`, ` Cierre: ${fmt.full(k.c)}`];
            },
          },
        } : null),
      },
    };

    if (type === 'radar') {
      options.scales = {
        r: {
          beginAtZero: true,
          angleLines: { color: cssVar('--chart-grid') },
          grid: { color: cssVar('--chart-grid') },
          pointLabels: { color: cssVar('--chart-axis'), font: { size: 11.5, weight: '600' } },
          ticks: { display: false, backdropColor: 'transparent' },
        },
      };
    } else if (!isCircular) {
      options.scales = cartesianScales(spec, fmt, type);
    } else {
      options.cutout = type === 'doughnut' ? '62%' : 0;
    }

    return {
      type: CHARTJS_BASE[type] || 'bar',
      data: { labels: Array.isArray(spec.labels) ? spec.labels : [], datasets },
      options,
    };
  }

  function renderChartJs(spec, type) {
    ensureDefaults();
    const wrap = el('div', 'chart-wrap');
    wrap.dataset.kind = type;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', ariaLabel(spec, type));
    wrap.appendChild(canvas);
    // Se instancia en el siguiente frame: antes de estar en el DOM el canvas
    // no tiene medidas y Chart.js calcularía mal el área.
    requestAnimationFrame(() => {
      if (!canvas.isConnected || !window.Chart) return;
      try {
        new Chart(canvas, buildChartJs(spec, type));
      } catch (err) {
        console.error('No se pudo dibujar la gráfica', type, err);
      }
    });
    return wrap;
  }

  // ---------- Gauge: arco de 270° con muescas (135° → 405°, como Bklit) ----------
  const GAUGE_START = 135;
  const GAUGE_SWEEP = 270;
  const GAUGE_NOTCHES = 40;

  function renderGauge(spec) {
    const fmt = formatter(spec);
    const max = Number(spec.max) > 0 ? Number(spec.max) : 100;
    const value = Math.max(0, Math.min(max, num(spec.value)));
    const ratio = max ? value / max : 0;
    const color = spec.color || cssVar('--chart-1');

    const W = 260, H = 190, cx = W / 2, cy = 104;
    const rOut = 92, rIn = 62;
    const wrap = el('div', 'chart-wrap ch-radial');
    wrap.dataset.kind = 'gauge';
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%',
      role: 'img', 'aria-label': `${spec.title || 'Indicador'}: ${fmt.full(value)} de ${fmt.full(max)}`,
    });

    const step = GAUGE_SWEEP / GAUGE_NOTCHES;
    const stroke = Math.max(3, ((rIn + rOut) / 2) * (step * Math.PI / 180) * 0.75);
    const active = Math.round(ratio * GAUGE_NOTCHES);
    for (let i = 0; i < GAUGE_NOTCHES; i++) {
      const deg = GAUGE_START + step * (i + 0.5);
      const [x1, y1] = polar(cx, cy, rIn, deg);
      const [x2, y2] = polar(cx, cy, rOut, deg);
      const on = i < active;
      const notch = svgEl('line', {
        x1, y1, x2, y2,
        stroke: on ? color : cssVar('--chart-track'),
        'stroke-width': stroke.toFixed(2),
        'stroke-linecap': 'round',
      });
      if (on) {
        notch.style.opacity = '0';
        notch.style.transition = `opacity 260ms var(--ease-out) ${i * 14}ms`;
        requestAnimationFrame(() => { notch.style.opacity = '1'; });
      }
      svg.appendChild(notch);
    }
    // Extremos de la escala, para que el arco tenga referencia.
    svg.appendChild(svgText(cx - rOut + 4, cy + 52, fmt.axis(spec.min != null ? num(spec.min) : 0), { class: 'ch-scale', 'text-anchor': 'middle' }));
    svg.appendChild(svgText(cx + rOut - 4, cy + 52, fmt.axis(max), { class: 'ch-scale', 'text-anchor': 'middle' }));
    wrap.appendChild(svg);

    const center = el('div', 'ch-center');
    center.appendChild(el('div', 'ch-value', spec.valueLabel || fmt.full(value)));
    if (spec.label) center.appendChild(el('div', 'ch-label', spec.label));
    wrap.appendChild(center);
    return wrap;
  }

  // ---------- Ring: avance sobre una meta, con la cifra al centro ----------
  function renderRing(spec) {
    const fmt = formatter(spec);
    const max = Number(spec.max) > 0 ? Number(spec.max) : 100;
    const value = num(spec.value);
    const ratio = Math.max(0, Math.min(1, max ? value / max : 0));
    const color = spec.color || cssVar('--chart-1');

    const S = 200, c = S / 2, r = 78, stroke = 18;
    const circumference = 2 * Math.PI * r;
    const wrap = el('div', 'chart-wrap ch-radial');
    wrap.dataset.kind = 'ring';
    const svg = svgEl('svg', {
      viewBox: `0 0 ${S} ${S}`, width: '100%', height: '100%',
      role: 'img', 'aria-label': `${spec.title || 'Avance'}: ${Math.round(ratio * 100)}%`,
    });
    svg.appendChild(svgEl('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: cssVar('--chart-track'), 'stroke-width': stroke,
    }));
    const arc = svgEl('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': circumference.toFixed(2), 'stroke-dashoffset': circumference.toFixed(2),
      transform: `rotate(-90 ${c} ${c})`,
    });
    arc.style.transition = 'stroke-dashoffset 900ms var(--ease-out)';
    svg.appendChild(arc);
    requestAnimationFrame(() => {
      arc.setAttribute('stroke-dashoffset', (circumference * (1 - ratio)).toFixed(2));
    });
    wrap.appendChild(svg);

    const center = el('div', 'ch-center');
    center.appendChild(el('div', 'ch-value', spec.valueLabel || (spec.format === 'percent' ? `${Math.round(ratio * 100)}%` : fmt.full(value))));
    center.appendChild(el('div', 'ch-label', spec.label || `de ${fmt.full(max)}`));
    wrap.appendChild(center);
    return wrap;
  }

  // ---------- Funnel: etapas de una conversión o de un flujo de dinero ----------
  // Cada etapa es una fila propia con su trapecio de fondo: el texto es HTML
  // dentro de la fila, así que no puede desalinearse del dibujo ni deformarse
  // con el preserveAspectRatio que estira las figuras al ancho de la tarjeta.
  function renderFunnel(spec) {
    const fmt = formatter(spec);
    const labels = Array.isArray(spec.labels) ? spec.labels : [];
    const data = numbers(series(spec)[0]);
    const steps = labels.map((label, i) => ({ label, value: num(data[i]) }));

    const wrap = el('div', 'chart-wrap ch-flow');
    wrap.dataset.kind = 'funnel';
    if (!steps.length) return wrap;

    const first = steps[0].value;
    const top = Math.abs(first) || 1;
    const label = fmt.scaled(top);
    // Ninguna etapa baja del 16% de ancho: por debajo el trapecio deja de leerse.
    const widthOf = (v) => Math.max(0.16, Math.abs(v) / top);

    const list = el('div', 'ch-funnel');
    steps.forEach((step, i) => {
      const wTop = widthOf(step.value);
      const wBottom = steps[i + 1] ? widthOf(steps[i + 1].value) : wTop * 0.94;
      const row = el('div', 'ch-step');
      const shape = el('div', 'ch-step-shape');
      const svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      svg.appendChild(svgEl('polygon', {
        points: [
          `${(100 - wTop * 100) / 2},0`, `${(100 + wTop * 100) / 2},0`,
          `${(100 + wBottom * 100) / 2},100`, `${(100 - wBottom * 100) / 2},100`,
        ].join(' '),
        fill: palette()[i % 8],
        opacity: 0.92,
      }));
      shape.appendChild(svg);
      row.appendChild(shape);

      // Las etiquetas van al costado, no dentro: las últimas etapas son
      // demasiado estrechas para contener su propio texto.
      const info = el('div', 'ch-step-info');
      info.appendChild(el('span', 'ch-step-name', step.label));
      const value = el('span', 'ch-step-val');
      value.appendChild(el('b', null, label(step.value)));
      // El porcentaje es contra la primera etapa, que es lo que se quiere leer.
      if (i > 0 && first) value.appendChild(el('i', null, `${Math.round((step.value / first) * 100)}%`));
      info.appendChild(value);
      row.appendChild(info);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    wrap.setAttribute('role', 'img');
    const resumen = steps.map((s) => `${s.label} ${fmt.full(s.value)}`).join(', ');
    wrap.setAttribute('aria-label', `${spec.title || 'Embudo'}: ${resumen}`);
    return wrap;
  }

  // ---------- Heatmap: matriz series × etiquetas ----------
  function renderHeatmap(spec) {
    const fmt = formatter(spec);
    const labels = Array.isArray(spec.labels) ? spec.labels : [];
    const rows = series(spec);
    const all = rows.flatMap((d) => numbers(d));
    const max = Math.max(1, ...all.map(Math.abs));
    const base = spec.color || cssVar('--chart-1');
    const empty = cssVar('--chart-background');

    const wrap = el('div', 'chart-wrap ch-flow');
    wrap.dataset.kind = 'heatmap';
    const cell = fmt.scaled(max);
    const grid = el('div', 'ch-heat');
    grid.style.setProperty('--cols', String(Math.max(1, labels.length)));

    grid.appendChild(el('div', 'ch-heat-corner'));
    for (const label of labels) grid.appendChild(el('div', 'ch-heat-col', label));
    rows.forEach((row, r) => {
      grid.appendChild(el('div', 'ch-heat-row', row.label || `Serie ${r + 1}`));
      const data = numbers(row);
      labels.forEach((label, i) => {
        const value = num(data[i]);
        const t = Math.abs(value) / max;
        const cellNode = el('div', 'ch-heat-cell');
        cellNode.style.background = t === 0 ? empty : mix(empty, base, 0.12 + t * 0.88);
        cellNode.style.color = t > 0.55 ? '#ffffff' : cssVar('--chart-axis');
        cellNode.title = `${row.label || ''} · ${label}: ${fmt.full(value)}`;
        cellNode.textContent = value === 0 ? '' : cell(value);
        cellNode.style.opacity = '0';
        cellNode.style.transition = `opacity 260ms var(--ease-out) ${(r * labels.length + i) * 12}ms`;
        requestAnimationFrame(() => { cellNode.style.opacity = '1'; });
        grid.appendChild(cellNode);
      });
    });
    wrap.appendChild(grid);

    const scale = el('div', 'ch-heat-scale');
    scale.appendChild(el('span', null, cell(0)));
    const bar = el('div', 'ch-heat-bar');
    bar.style.background = `linear-gradient(90deg, ${mix(empty, base, 0.12)} 0%, ${base} 100%)`;
    scale.appendChild(bar);
    scale.appendChild(el('span', null, cell(max)));
    wrap.appendChild(scale);
    return wrap;
  }

  // ---------- Descripción accesible ----------
  function ariaLabel(spec, type) {
    const names = series(spec).map((d) => d.label).filter(Boolean).join(', ');
    const count = (Array.isArray(spec.labels) ? spec.labels.length : 0);
    return [spec.title || 'Gráfica', `tipo ${type}`, names && `series: ${names}`, count && `${count} categorías`]
      .filter(Boolean).join('. ');
  }

  // ---------- Miniaturas del carrusel ----------
  // Estáticas y en SVG: instanciar Chart.js por tarjeta del historial costaría
  // un canvas y una animación cada una, y a escala 0.32 el detalle no se lee.
  // Aun así cada tipo conserva su silueta para que la miniatura se reconozca.
  const MINI_W = 300;
  const MINI_H = 60;

  function miniSvg() {
    const svg = svgEl('svg', {
      viewBox: `0 0 ${MINI_W} ${MINI_H}`, width: '100%', height: MINI_H * 2,
      preserveAspectRatio: 'none', 'aria-hidden': 'true',
    });
    return svg;
  }

  function miniBars(vals, colors) {
    const svg = miniSvg();
    const max = Math.max(1, ...vals.map(Math.abs));
    const gap = Math.min(8, MINI_W / (vals.length * 5));
    const w = (MINI_W - gap * (vals.length - 1)) / vals.length;
    vals.forEach((v, i) => {
      const h = Math.max(3, (Math.abs(v) / max) * (MINI_H - 4));
      svg.appendChild(svgEl('rect', {
        x: i * (w + gap), y: MINI_H - h, width: w, height: h, rx: 3, fill: colors(i, v),
      }));
    });
    return svg;
  }

  function miniLine(vals, color, filled) {
    const svg = miniSvg();
    const max = Math.max(...vals), min = Math.min(...vals, 0);
    const span = max - min || 1;
    const dx = vals.length > 1 ? MINI_W / (vals.length - 1) : MINI_W;
    const pts = vals.map((v, i) => `${(i * dx).toFixed(1)},${(MINI_H - 3 - ((v - min) / span) * (MINI_H - 6)).toFixed(1)}`);
    if (filled) {
      svg.appendChild(svgEl('polygon', {
        points: `0,${MINI_H} ${pts.join(' ')} ${MINI_W},${MINI_H}`, fill: withAlpha(color, 0.22),
      }));
    }
    svg.appendChild(svgEl('polyline', {
      points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
    }));
    return svg;
  }

  function miniArc(vals, cut) {
    const svg = svgEl('svg', {
      viewBox: '0 0 120 120', width: '100%', height: MINI_H * 2, 'aria-hidden': 'true',
    });
    const total = vals.reduce((a, b) => a + Math.abs(b), 0) || 1;
    let angle = -90;
    vals.forEach((v, i) => {
      const sweep = (Math.abs(v) / total) * 360;
      const [x1, y1] = polar(60, 60, 52, angle);
      const [x2, y2] = polar(60, 60, 52, angle + sweep);
      svg.appendChild(svgEl('path', {
        d: `M 60 60 L ${x1} ${y1} A 52 52 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
        fill: palette()[i % 8],
      }));
      angle += sweep;
    });
    if (cut) svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r: 30, fill: '#ffffff' }));
    return svg;
  }

  function miniGauge(ratio) {
    const svg = svgEl('svg', { viewBox: '0 0 120 80', width: '100%', height: MINI_H * 2, 'aria-hidden': 'true' });
    const draw = (from, to, color) => {
      const [x1, y1] = polar(60, 62, 46, from);
      const [x2, y2] = polar(60, 62, 46, to);
      svg.appendChild(svgEl('path', {
        d: `M ${x1} ${y1} A 46 46 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`,
        fill: 'none', stroke: color, 'stroke-width': 12, 'stroke-linecap': 'round',
      }));
    };
    draw(GAUGE_START, GAUGE_START + GAUGE_SWEEP, cssVar('--chart-track'));
    if (ratio > 0.01) draw(GAUGE_START, GAUGE_START + GAUGE_SWEEP * ratio, cssVar('--chart-1'));
    return svg;
  }

  function miniScatter(points) {
    const svg = miniSvg();
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    points.forEach((p, i) => {
      svg.appendChild(svgEl('circle', {
        cx: ((p.x - Math.min(...xs)) / spanX) * (MINI_W - 8) + 4,
        cy: MINI_H - 4 - ((p.y - Math.min(...ys)) / spanY) * (MINI_H - 8),
        r: 3.5, fill: withAlpha(palette()[i % 8], 0.8),
      }));
    });
    return svg;
  }

  function miniHeat(spec) {
    const rows = series(spec);
    const cols = Math.max(1, (spec.labels || []).length);
    const all = rows.flatMap((d) => numbers(d));
    const max = Math.max(1, ...all.map(Math.abs));
    const svg = miniSvg();
    const cw = MINI_W / cols, chh = MINI_H / Math.max(1, rows.length);
    rows.forEach((row, r) => {
      numbers(row).slice(0, cols).forEach((v, c) => {
        svg.appendChild(svgEl('rect', {
          x: c * cw + 0.5, y: r * chh + 0.5, width: cw - 1, height: chh - 1, rx: 2,
          fill: mix(cssVar('--chart-background'), cssVar('--chart-1'), 0.12 + (Math.abs(v) / max) * 0.88),
        }));
      });
    });
    return svg;
  }

  function miniFunnel(vals) {
    const svg = miniSvg();
    const top = Math.abs(vals[0]) || 1;
    const rowH = MINI_H / vals.length;
    vals.forEach((v, i) => {
      const next = vals[i + 1];
      const wTop = Math.max(0.16, Math.abs(v) / top) * MINI_W;
      const wBot = (next != null ? Math.max(0.16, Math.abs(next) / top) : Math.max(0.16, Math.abs(v) / top) * 0.94) * MINI_W;
      const y = i * rowH;
      svg.appendChild(svgEl('polygon', {
        points: `${(MINI_W - wTop) / 2},${y} ${(MINI_W + wTop) / 2},${y} ${(MINI_W + wBot) / 2},${y + rowH - 1} ${(MINI_W - wBot) / 2},${y + rowH - 1}`,
        fill: palette()[i % 8], opacity: 0.9,
      }));
    });
    return svg;
  }

  function createPreview(spec) {
    const type = resolveType(spec);
    const first = series(spec)[0];
    const vals = numbers(first).slice(0, 14);
    try {
      if (type === 'gauge' || type === 'ring') {
        const max = Number(spec.max) > 0 ? Number(spec.max) : 100;
        const ratio = Math.max(0, Math.min(1, num(spec.value) / max));
        return type === 'gauge' ? miniGauge(ratio) : miniArc([ratio, Math.max(0.0001, 1 - ratio)], true);
      }
      if (!vals.length && type !== 'scatter') return miniSvg();
      if (type === 'pie' || type === 'doughnut') return miniArc(vals, type === 'doughnut');
      if (type === 'radar') return miniArc(vals, false);
      if (type === 'heatmap') return miniHeat(spec);
      if (type === 'funnel') return miniFunnel(vals);
      if (type === 'scatter') {
        const points = rawData(first).map((p, i) => (p && typeof p === 'object'
          ? { x: num(p.x), y: num(p.y) } : { x: i, y: num(p) })).slice(0, 24);
        return points.length ? miniScatter(points) : miniSvg();
      }
      if (type === 'line' || type === 'area') {
        return miniLine(vals, seriesColor(first, 0), type === 'area' || spec.fill === true);
      }
      if (type === 'profit_loss') {
        return miniBars(vals, (_, v) => (v >= 0 ? cssVar('--chart-positive') : cssVar('--chart-negative')));
      }
      if (type === 'candlestick') {
        const candles = rawData(first).slice(0, 14).map((k) => ({
          o: num(k && (k.o != null ? k.o : k.open)), c: num(k && (k.c != null ? k.c : k.close)),
        }));
        return miniBars(candles.map((k) => k.c || 0), (i) => (candles[i] && candles[i].c >= candles[i].o
          ? cssVar('--chart-positive') : cssVar('--chart-negative')));
      }
      // bar, stacked_bar, horizontal_bar y composed comparten silueta de barras.
      return miniBars(vals, (i) => palette()[i % 8]);
    } catch (err) {
      console.error('No se pudo dibujar la miniatura', type, err);
      return miniSvg();
    }
  }

  // ---------- API pública ----------
  const CUSTOM_RENDERERS = {
    gauge: renderGauge, ring: renderRing, funnel: renderFunnel, heatmap: renderHeatmap,
  };

  window.NorteCharts = {
    TYPES,
    resolveType,
    // Devuelve el cuerpo de la gráfica (sin la tarjeta): canvas de Chart.js o SVG propio.
    create(spec) {
      const type = resolveType(spec);
      const custom = CUSTOM_RENDERERS[type];
      return custom ? custom(spec || {}) : renderChartJs(spec || {}, type);
    },
    createPreview,
  };
})();

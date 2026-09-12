// Gráfica de rendimiento (SVG propio): curva monótona, área con degradado,
// animación de trazado al aparecer, morph entre rangos y tooltip interactivo.
// Trabaja en píxeles reales del contenedor (sin deformar texto) y se
// re-dibuja al cambiar de tamaño.
(function () {
  const DEFAULT_W = 1000;
  const DEFAULT_H = 300;
  const PAD = { l: 50, r: 16, t: 28, b: 34 };
  const NS = 'http://www.w3.org/2000/svg';
  const DRAW_MS = 1500;
  const MORPH_MS = 650;
  let instanceCount = 0;

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
  function reducedMotion() {
    return document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function niceStep(span, targetTicks) {
    const rough = span / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return nice * mag;
  }
  function domainFor(values) {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max === min) { max += 1; min -= 1; }
    const span = max - min;
    const lo = min - span * 0.4;
    const hi = max + span * 0.2;
    const step = niceStep(hi - lo, 4);
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Interpolación cúbica monótona (sin sobre-oscilación) → segmentos Bézier.
  function monotonePath(pts) {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M${pts[0].x},${pts[0].y}`;
    const dx = [];
    const dy = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1].x - pts[i].x);
      dy.push(pts[i + 1].y - pts[i].y);
      m.push(dy[i] / (dx[i] || 1e-6));
    }
    const tang = [m[0]];
    for (let i = 1; i < n - 1; i++) {
      tang.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    }
    tang.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { tang[i] = 0; tang[i + 1] = 0; continue; }
      const a = tang[i] / m[i];
      const b = tang[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) { const tau = 3 / Math.sqrt(s); tang[i] = tau * a * m[i]; tang[i + 1] = tau * b * m[i]; }
    }
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const c1x = pts[i].x + dx[i] / 3;
      const c1y = pts[i].y + (tang[i] * dx[i]) / 3;
      const c2x = pts[i + 1].x - dx[i] / 3;
      const c2y = pts[i + 1].y - (tang[i + 1] * dx[i]) / 3;
      d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
    }
    return d;
  }

  class PerformanceChart {
    constructor(container) {
      this.c = container;
      this.id = `pc${++instanceCount}`;
      this.W = DEFAULT_W;
      this.H = DEFAULT_H;
      this.series = null;
      this.pixels = [];
      this.domain = null;
      this.cursorIndex = null;
      this.raf = null;
      this.build();
      this.relayout();
    }

    build() {
      const svg = svgEl('svg', { viewBox: `0 0 ${this.W} ${this.H}` });
      const defs = svgEl('defs');
      const lg = svgEl('linearGradient', { id: `${this.id}-line`, x1: '0', y1: '0', x2: '1', y2: '0' });
      lg.append(svgEl('stop', { offset: '0%', 'stop-color': '#d98dbe' }), svgEl('stop', { offset: '60%', 'stop-color': '#f2a9d3' }), svgEl('stop', { offset: '100%', 'stop-color': '#ffd3ea' }));
      const ag = svgEl('linearGradient', { id: `${this.id}-area`, x1: '0', y1: '0', x2: '0', y2: '1' });
      ag.append(svgEl('stop', { offset: '0%', 'stop-color': '#f2a9d3', 'stop-opacity': '0.42' }), svgEl('stop', { offset: '70%', 'stop-color': '#f2a9d3', 'stop-opacity': '0.06' }), svgEl('stop', { offset: '100%', 'stop-color': '#f2a9d3', 'stop-opacity': '0' }));
      const clip = svgEl('clipPath', { id: `${this.id}-clip` });
      this.clipRect = svgEl('rect', { x: '0', y: '0', width: this.W, height: this.H });
      clip.append(this.clipRect);
      defs.append(lg, ag, clip);

      this.gGrid = svgEl('g', { class: 'grid' });
      this.gAxis = svgEl('g', { class: 'axis' });
      this.area = svgEl('path', { class: 'area', fill: `url(#${this.id}-area)`, 'clip-path': `url(#${this.id}-clip)` });
      this.line = svgEl('path', { class: 'line', stroke: `url(#${this.id}-line)` });
      this.cursorLine = svgEl('line', { class: 'cursor-line' });
      this.markerRing = svgEl('circle', { class: 'marker-ring', r: 6 });
      this.marker = svgEl('circle', { class: 'marker', r: 5.5 });
      this.hit = svgEl('rect', { class: 'hit', x: PAD.l, y: 0, width: this.W - PAD.l - PAD.r, height: this.H });
      svg.append(defs, this.gGrid, this.gAxis, this.area, this.line, this.cursorLine, this.markerRing, this.marker, this.hit);
      this.svg = svg;

      this.tip = document.createElement('div');
      this.tip.className = 'chart-tip';
      this.c.append(svg, this.tip);

      this.hit.addEventListener('pointermove', (e) => this.handlePointer(e));
      this.hit.addEventListener('pointerleave', () => this.resetCursor());
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.relayout());
        this.observer.observe(this.c);
      } else {
        this.onResize = () => this.relayout();
        window.addEventListener('resize', this.onResize);
      }
    }

    // Adapta el lienzo al tamaño real del contenedor (1 unidad = 1 px).
    relayout() {
      const w = Math.round(this.c.clientWidth);
      const h = Math.round(this.c.clientHeight);
      if (!w || !h) return;
      const changed = w !== this.W || h !== this.H;
      this.W = w;
      this.H = h;
      if (changed) {
        this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        this.clipRect.setAttribute('height', h);
        if (!this.drawing) this.clipRect.setAttribute('width', w);
        this.hit.setAttribute('width', Math.max(0, w - PAD.l - PAD.r));
        this.hit.setAttribute('height', h);
        if (this.series && !this.raf && !this.drawing) {
          this.pixels = this.toPixels(this.series.points.map((p) => p.v), this.domain);
          this.renderAxes(this.series, this.domain);
          this.drawPaths(this.pixels);
        }
      }
      if (this.cursorIndex !== null && !this.raf) this.setCursor(this.cursorIndex);
    }

    xAt(i, n) { return PAD.l + (i * (this.W - PAD.l - PAD.r)) / Math.max(1, n - 1); }
    yAt(v, domain) { return PAD.t + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * (this.H - PAD.t - PAD.b); }

    toPixels(values, domain) {
      return values.map((v, i) => ({ x: this.xAt(i, values.length), y: this.yAt(v, domain) }));
    }

    xLabels(series) {
      const { fmtDate } = window.I18N;
      const pts = series.points;
      const labels = [];
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      // En pantallas angostas se muestran menos etiquetas para evitar solapes.
      const maxLabels = Math.max(4, Math.floor((this.W - PAD.l - PAD.r) / 60));
      pts.forEach((p, i) => {
        const d = new Date(p.t);
        const prev = i > 0 ? new Date(pts[i - 1].t) : null;
        let text = null;
        if (series.range === '1Y' || series.range === '6M') {
          if (prev && d.getMonth() !== prev.getMonth()) text = cap(fmtDate(p.t, 'monthShort'));
        } else if (series.range === '1M') {
          if (i % 5 === 0) text = fmtDate(p.t, 'dayMonth');
        } else if (series.range === '1W') {
          if (!prev || d.getDate() !== prev.getDate()) text = cap(fmtDate(p.t, 'weekday'));
        } else if (i % 4 === 0) {
          text = fmtDate(p.t, 'time');
        }
        if (text) labels.push({ i, text });
      });
      if (labels.length > maxLabels) {
        const every = Math.ceil(labels.length / maxLabels);
        return labels.filter((_, idx) => idx % every === 0);
      }
      return labels;
    }

    // Etiquetas del eje Y con la precisión necesaria para que no se repitan.
    axisLabel(v, step) {
      if (step >= 1000) return `${Math.round(v / 1000)}k`;
      if (step >= 100) return `${(v / 1000).toFixed(1)}k`;
      if (step >= 10) return `${(v / 1000).toFixed(2)}k`;
      return window.I18N.fmtNumber(v, 0);
    }

    renderAxes(series, domain) {
      this.gGrid.replaceChildren();
      this.gAxis.replaceChildren();
      for (let v = domain.lo; v <= domain.hi + 1e-9; v += domain.step) {
        const y = this.yAt(v, domain);
        this.gGrid.append(svgEl('line', { x1: PAD.l, x2: this.W - PAD.r, y1: y, y2: y }));
        const label = svgEl('text', { x: PAD.l - 10, y: y + 4, 'text-anchor': 'end' });
        label.textContent = this.axisLabel(v, domain.step);
        this.gAxis.append(label);
      }
      this.gGrid.append(svgEl('line', { class: 'baseline', x1: PAD.l, x2: this.W - PAD.r, y1: this.H - PAD.b, y2: this.H - PAD.b }));
      for (const { i, text } of this.xLabels(series)) {
        const label = svgEl('text', { x: this.xAt(i, series.points.length), y: this.H - 8, 'text-anchor': 'middle' });
        label.textContent = text;
        this.gAxis.append(label);
      }
    }

    drawPaths(pixels) {
      const d = monotonePath(pixels);
      this.line.setAttribute('d', d);
      const last = pixels[pixels.length - 1];
      const first = pixels[0];
      const base = this.H - PAD.b;
      this.area.setAttribute('d', `${d} L${last.x.toFixed(2)},${base} L${first.x.toFixed(2)},${base} Z`);
    }

    // Cancela cualquier animación en curso (trazado inicial o morph) para evitar
    // que un cambio de rango durante el dibujo deje el estado inconsistente.
    cancelAnimations() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      (this.anims ?? []).forEach((a) => a.cancel());
      this.anims = [];
      if (this.drawing) {
        this.drawing = false;
        this.line.style.strokeDasharray = '';
        this.line.style.strokeDashoffset = '';
        this.clipRect.setAttribute('width', this.W);
      }
    }

    setSeries(series, { animate = true, morph = false } = {}) {
      if (!series || !series.points?.length) return;
      this.cancelAnimations();
      this.relayout();
      const values = series.points.map((p) => p.v);
      const domain = domainFor(values);
      const target = this.toPixels(values, domain);
      const wasDrawn = this.pixels.length > 0;
      this.series = series;
      this.domain = domain;
      this.renderAxes(series, domain);
      this.c.classList.remove('has-cursor');
      this.tip.classList.remove('is-visible');
      this.cursorIndex = null;

      if (morph && wasDrawn && !reducedMotion()) {
        this.morphTo(target);
        return;
      }
      this.pixels = target;
      this.drawPaths(target);
      if (animate && !reducedMotion()) this.drawInitial();
      else { this.c.classList.add('is-drawn'); this.setCursor(series.highlightIndex ?? values.length - 1); }
    }

    drawInitial() {
      const length = this.line.getTotalLength();
      this.drawing = true;
      this.line.style.strokeDasharray = `${length}`;
      this.line.style.strokeDashoffset = `${length}`;
      this.clipRect.setAttribute('width', '0');
      this.c.classList.remove('is-drawn');
      const lineAnim = this.line.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: DRAW_MS, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
      const clipAnim = this.clipRect.animate([{ width: '0px' }, { width: `${this.W}px` }], { duration: DRAW_MS, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
      this.anims = [lineAnim, clipAnim];
      const seriesAtStart = this.series;
      requestAnimationFrame(() => this.c.classList.add('is-drawn'));
      lineAnim.onfinish = () => {
        if (this.series !== seriesAtStart) return;
        this.anims = [];
        this.drawing = false;
        this.line.style.strokeDasharray = '';
        this.line.style.strokeDashoffset = '';
        this.clipRect.setAttribute('width', this.W);
        this.setCursor(this.series.highlightIndex ?? this.pixels.length - 1);
      };
    }

    // Reamuestra la curva actual al número de puntos del destino y anima punto a punto.
    morphTo(target) {
      const from = this.resample(this.pixels, target.length);
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / MORPH_MS);
        const e = easeOut(p);
        const cur = target.map((tp, i) => ({ x: tp.x, y: from[i].y + (tp.y - from[i].y) * e }));
        this.drawPaths(cur);
        if (p < 1) { this.raf = requestAnimationFrame(step); return; }
        this.pixels = target;
        this.raf = null;
        this.setCursor(this.series.highlightIndex ?? target.length - 1);
      };
      this.raf = requestAnimationFrame(step);
    }

    resample(pixels, count) {
      if (pixels.length === count) return pixels;
      const out = [];
      for (let i = 0; i < count; i++) {
        const pos = (i * (pixels.length - 1)) / Math.max(1, count - 1);
        const lo = Math.floor(pos);
        const hi = Math.min(pixels.length - 1, lo + 1);
        const f = pos - lo;
        out.push({ x: this.xAt(i, count), y: pixels[lo].y + (pixels[hi].y - pixels[lo].y) * f });
      }
      return out;
    }

    handlePointer(e) {
      if (!this.pixels.length || this.raf) return;
      const rect = this.svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * this.W;
      const stepX = (this.W - PAD.l - PAD.r) / Math.max(1, this.pixels.length - 1);
      const i = Math.max(0, Math.min(this.pixels.length - 1, Math.round((px - PAD.l) / stepX)));
      if (i !== this.cursorIndex) this.setCursor(i);
    }

    resetCursor() {
      if (!this.series) return;
      this.setCursor(this.series.highlightIndex ?? this.pixels.length - 1);
    }

    setCursor(i) {
      const { fmtMoney, fmtDate, fmtPct, t } = window.I18N;
      const p = this.pixels[i];
      const point = this.series?.points[i];
      if (!p || !point) return;
      this.cursorIndex = i;
      this.cursorLine.setAttribute('x1', p.x); this.cursorLine.setAttribute('x2', p.x);
      this.cursorLine.setAttribute('y1', p.y); this.cursorLine.setAttribute('y2', this.H - PAD.b);
      this.marker.setAttribute('cx', p.x); this.marker.setAttribute('cy', p.y);
      this.markerRing.setAttribute('cx', p.x); this.markerRing.setAttribute('cy', p.y);
      this.c.classList.add('has-cursor');

      const start = this.series.startValue;
      const pct = ((point.v - start) / start) * 100;
      const dateStyle = this.series.range === '1D' || this.series.range === '1W' ? 'longTime' : 'long';
      this.tip.replaceChildren();
      const d = document.createElement('div'); d.className = 'd';
      const ds = document.createElement('span'); ds.textContent = fmtDate(point.t, dateStyle);
      const dots = document.createElement('i'); dots.textContent = '•••';
      d.append(ds, dots);
      const v = document.createElement('div'); v.className = 'v';
      const b = document.createElement('b'); b.textContent = fmtMoney(point.v, this.series.currency ?? 'USD');
      const chip = document.createElement('span'); chip.className = `chip${pct < 0 ? ' neg' : ''}`;
      chip.title = t('perf.vsStart');
      chip.innerHTML = `${window.ICONS.icon(pct < 0 ? 'arrowDown' : 'arrowUp')}<span>${fmtPct(pct, 1)}</span>`;
      v.append(b, chip);
      this.tip.append(d, v);

      const halfTip = 90;
      const left = Math.max(halfTip, Math.min(this.W - halfTip, p.x));
      this.tip.style.left = `${left}px`;
      this.tip.style.top = `${p.y}px`;
      this.tip.classList.toggle('flip', p.y < 92);
      this.tip.classList.add('is-visible');
    }

    refresh() {
      if (!this.series) return;
      this.renderAxes(this.series, this.domain);
      if (this.cursorIndex !== null) this.setCursor(this.cursorIndex);
    }

    destroy() {
      this.cancelAnimations();
      this.observer?.disconnect();
      if (this.onResize) window.removeEventListener('resize', this.onResize);
      this.c.replaceChildren();
    }
  }

  // Sparkline sencillo para tarjetas de mercado.
  function sparklinePaths(values, width = 200, height = 44) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => ({ x: (i * width) / (values.length - 1), y: 4 + (1 - (v - min) / span) * (height - 8) }));
    const line = monotonePath(pts);
    return { line, area: `${line} L${width},${height} L0,${height} Z` };
  }

  window.PerformanceChart = PerformanceChart;
  window.sparklinePaths = sparklinePaths;
})();

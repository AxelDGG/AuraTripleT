// Datos simulados de mercado e inversión bursátil (USD) para el dashboard.
// Las series de precios se generan de forma determinista (semilla fija) para
// que el producto se vea igual en cada arranque.

export const PORTFOLIO_CURRENCY = 'USD';

export const holdings = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', units: 104, price: 232.15, changePct: 0.7 },
  { symbol: 'AMZN', name: 'Amazon.com', exchange: 'NASDAQ', units: 12, price: 186.4, changePct: 0.81 },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', units: 41, price: 421.3, changePct: 0.49 },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', units: 16, price: 128.55, changePct: 2.12 },
];

export const watchlist = [
  { symbol: 'SPOT', name: 'Spotify', exchange: 'NYSE', price: 342.18, changePct: 1.63, views: 980 },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', price: 186.4, changePct: 0.81, views: 910 },
  { symbol: 'MSFT', name: 'MSFT', exchange: 'NASDAQ', price: 421.3, changePct: 0.49, views: 870 },
  { symbol: 'NVDA', name: 'NVDA', exchange: 'NASDAQ', price: 128.55, changePct: 2.12, views: 840 },
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', price: 232.15, changePct: 0.7, views: 800 },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', price: 248.9, changePct: -1.84, views: 760 },
  { symbol: 'META', name: 'Meta Platforms', exchange: 'NASDAQ', price: 512.7, changePct: -0.62, views: 640 },
  { symbol: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ', price: 168.2, changePct: 1.12, views: 610 },
];

export const PERFORMANCE_RANGES = ['1D', '1W', '1M', '6M', '1Y'];

// Generador pseudoaleatorio determinista (mulberry32).
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Camino aleatorio con reversión a una tendencia, reescalado para terminar
// exactamente en `endValue`. Devuelve `count` valores.
export function generateWalk({ seed, count, endValue, volatility, startRatio }) {
  const rand = seededRandom(seed);
  const values = [1];
  for (let i = 1; i < count; i++) {
    const shock = (rand() - 0.5) * 2 * volatility;
    const wave = Math.sin(i / (count / 5)) * volatility * 0.35;
    values.push(Math.max(0.2, values[i - 1] * (1 + shock + wave)));
  }
  const first = values[0];
  const last = values[values.length - 1];
  const targetStart = endValue * startRatio;
  // Interpolación lineal del factor de escala para respetar inicio y fin.
  return values.map((v, i) => {
    const progress = i / (count - 1);
    const startScale = targetStart / first;
    const endScale = endValue / last;
    const scale = startScale + (endScale - startScale) * progress;
    return Math.round(v * scale * 100) / 100;
  });
}

const RANGE_CONFIG = {
  '1D': { count: 24, stepMs: 60 * 60 * 1000, volatility: 0.004, startRatio: 0.985, seed: 11 },
  '1W': { count: 56, stepMs: 3 * 60 * 60 * 1000, volatility: 0.006, startRatio: 0.962, seed: 22 },
  '1M': { count: 30, stepMs: 24 * 60 * 60 * 1000, volatility: 0.012, startRatio: 0.93, seed: 33 },
  '6M': { count: 60, stepMs: 3 * 24 * 60 * 60 * 1000, volatility: 0.02, startRatio: 0.84, seed: 44 },
  '1Y': { count: 53, stepMs: 7 * 24 * 60 * 60 * 1000, volatility: 0.028, startRatio: 0.74, seed: 55 },
};

export function buildPerformanceSeries(range, endValue, now = new Date('2026-09-02T16:00:00-06:00')) {
  const cfg = RANGE_CONFIG[range];
  if (!cfg) return null;
  const values = generateWalk({ seed: cfg.seed, count: cfg.count, endValue, volatility: cfg.volatility, startRatio: cfg.startRatio });
  const endMs = now.getTime();
  const points = values.map((v, i) => ({
    t: new Date(endMs - (cfg.count - 1 - i) * cfg.stepMs).toISOString(),
    v,
  }));
  let highlightIndex = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].v > points[highlightIndex].v) highlightIndex = i;
  }
  const startValue = points[0].v;
  return {
    range,
    points,
    startValue,
    endValue: points[points.length - 1].v,
    changeAbs: Math.round((points[points.length - 1].v - startValue) * 100) / 100,
    changePct: Math.round(((points[points.length - 1].v - startValue) / startValue) * 10000) / 100,
    highlightIndex,
  };
}

// Mini-serie (sparkline) por símbolo para la vista de mercado.
export function buildSparkline(symbol, price, changePct) {
  const seed = [...symbol].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return generateWalk({
    seed,
    count: 24,
    endValue: price,
    volatility: 0.015,
    startRatio: 1 / (1 + changePct / 100),
  });
}

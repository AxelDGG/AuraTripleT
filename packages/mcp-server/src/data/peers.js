// Población sintética de pares + motor de benchmark.
//
// Es la base del reto Snowflake: miles de clientes ficticios con 24 meses de
// gasto por categoría, generados de forma determinista (misma semilla, misma
// población). El repositorio `snowflake` calcula el benchmark contra la tabla
// de Snowflake cuando SNOWFLAKE_* está configurado (percentiles por SQL + una
// frase con SNOWFLAKE.CORTEX.COMPLETE); sin configuración, el mismo motor de
// aquí lo resuelve sobre la población local para que la demo no se caiga.
//
// Todo es ficticio y solo para demostración: no hay PII real.

export const PEER_CATEGORIES = [
  'Restaurantes',
  'Supermercado',
  'Compras',
  'Entretenimiento',
  'Transporte',
  'Salud',
  'Hogar',
  'Servicios',
  'Vivienda',
];

// Parámetros por segmento. `income` es [media, sigma] en escala log-normal;
// `shares` es la fracción del ingreso que va a cada categoría cada mes.
const SEGMENT_PARAMS = {
  Personal: {
    weight: 0.55,
    income: [16000, 0.35],
    shares: {
      Restaurantes: 0.055, Supermercado: 0.100, Compras: 0.060, Entretenimiento: 0.030,
      Transporte: 0.045, Salud: 0.028, Hogar: 0.040, Servicios: 0.050, Vivienda: 0.230,
    },
  },
  Preferente: {
    weight: 0.30,
    income: [42000, 0.42],
    shares: {
      Restaurantes: 0.050, Supermercado: 0.085, Compras: 0.055, Entretenimiento: 0.026,
      Transporte: 0.033, Salud: 0.024, Hogar: 0.036, Servicios: 0.046, Vivienda: 0.210,
    },
  },
  Premier: {
    weight: 0.15,
    income: [120000, 0.45],
    shares: {
      Restaurantes: 0.045, Supermercado: 0.065, Compras: 0.050, Entretenimiento: 0.024,
      Transporte: 0.026, Salud: 0.020, Hogar: 0.030, Servicios: 0.040, Vivienda: 0.180,
    },
  },
};

// Bump estacional mensual (índice por mes del año: Ene..Dic): regalos en mayo y
// navideño en noviembre–diciembre.
const SEASONAL = [1.02, 1.0, 1.01, 1.0, 1.06, 0.99, 1.0, 1.03, 1.0, 1.0, 1.1, 1.16];

export const SEGMENTS = Object.keys(SEGMENT_PARAMS);

// Semilla y tamaño por defecto de la población: valores fijos para que el
// benchmark de la demo sea reproducible en cada reinicio.
export const DEFAULT_SEED = 20260901;
export const DEFAULT_SIZE = 2500;
// Cuántos meses de historial genera la población (abre desde 2024-10).
export const HISTORY_MONTHS = 24;
export const LATEST_MONTH = '2026-09';

export function buildMonths(count = HISTORY_MONTHS, end = LATEST_MONTH) {
  const [ey, em] = end.split('-').map(Number);
  const months = [];
  let y = ey;
  let m = em;
  for (let i = 0; i < count; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months.reverse();
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSampler(rand) {
  let spare = null;
  return function normal(mu = 0, sigma = 1) {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return mu + value * sigma;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    return mu + u * m * sigma;
  };
}

// Genera (y cachea a nivel de módulo) la población determinista.
// Estructura: { months, segments[], incomes[], spend: { [category]: { [month]: Float32Array } } }
export function generatePopulation({ seed = DEFAULT_SEED, size = DEFAULT_SIZE } = {}) {
  const rand = mulberry32(seed);
  const normal = normalSampler(rand);
  const months = buildMonths(HISTORY_MONTHS);
  const segments = new Array(size);
  const incomes = new Float32Array(size);
  const spend = {};
  for (const cat of PEER_CATEGORIES) {
    spend[cat] = {};
    for (const month of months) spend[cat][month] = new Float32Array(size);
  }
  const monthIdx = (month) => Number(month.slice(5, 7)) - 1;

  for (let i = 0; i < size; i++) {
    let roll = rand();
    let segment = 'Personal';
    for (const [name, params] of Object.entries(SEGMENT_PARAMS)) {
      if (roll < params.weight) {
        segment = name;
        break;
      }
      roll -= params.weight;
    }
    const params = SEGMENT_PARAMS[segment];
    segments[i] = segment;
    // Log-normal: da una cola de ingresos altos dentro de cada segmento.
    const income = Math.max(3000, params.income[0] * Math.exp(normal(0, params.income[1])));
    incomes[i] = Math.round(income);
    for (const cat of PEER_CATEGORIES) {
      const share = params.shares[cat];
      for (let m = 0; m < months.length; m++) {
        const seasonal = SEASONAL[monthIdx(months[m])];
        const noise = Math.exp(normal(0, 0.35));
        spend[cat][months[m]][i] = income * share * seasonal * noise;
      }
    }
  }

  return { months, segments, incomes, spend };
}

let cachedPopulation = null;
export function getPopulation() {
  if (!cachedPopulation) cachedPopulation = generatePopulation();
  return cachedPopulation;
}

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Benchmark de pares: promedio mensual del cliente por categoría contra la
// misma distribución (segmento) de la población. `spending` trae los totales
// del cliente [{ category, total }] sumados sobre toda la ventana.
export function computePeerBenchmark({
  customer,
  spending = [],
  months = 6,
  population = getPopulation(),
  category = null,
} = {}) {
  const segment = customer?.segment && SEGMENTS.includes(customer.segment) ? customer.segment : 'Preferente';
  const span = Math.min(Math.max(Math.trunc(months) || 6, 3), 12);
  const windowMonths = population.months.slice(-span);
  const totals = new Map(spending.map((c) => [c.category, Number(c.total) || 0]));
  const mineOf = (cat) => (totals.get(cat) || 0) / span;

  // Promedio mensual por categoría de cada par del mismo segmento en la ventana.
  const rows = [];
  const peers = [];
  for (let i = 0; i < population.segments.length; i++) {
    if (population.segments[i] === segment) peers.push(i);
  }

  for (const cat of PEER_CATEGORIES) {
    if (category && cat !== category) continue;
    const byIndex = new Array(peers.length);
    for (let k = 0; k < peers.length; k++) {
      let sum = 0;
      for (const month of windowMonths) sum += population.spend[cat][month][peers[k]];
      byIndex[k] = sum / span;
    }
    byIndex.sort((a, b) => a - b);
    const mine = mineOf(cat);
    let lower = 0;
    let equal = 0;
    for (const v of byIndex) {
      if (v < mine) lower += 1;
      else if (v === mine) equal += 1;
    }
    const n = byIndex.length;
    const percentile = n === 0 ? null : round1(((lower + equal * 0.5) / n) * 100);
    const p25 = quantile(byIndex, 0.25);
    const p50 = quantile(byIndex, 0.5);
    const p75 = quantile(byIndex, 0.75);
    const p90 = quantile(byIndex, 0.9);
    rows.push({
      category: cat,
      mine: round2(mine),
      p25: round2(p25),
      p50: round2(p50),
      p75: round2(p75),
      p90: round2(p90),
      percentile,
      deltaPct: p50 > 0 ? round1(((mine - p50) / p50) * 100) : null,
    });
  }

  rows.sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0));

  // La lectura que abre la historia: la categoría donde más sobrepasa al
  // segmento (gasta más que la mediana) y, si no gasta de más en ninguna,
  // la mayor desviación a la baja.
  const lead = rows.find((r) => r.mine > r.p50 && r.percentile !== null) ?? rows[0] ?? null;
  const summary = lead
    ? {
        category: lead.category,
        percentile: lead.percentile,
        mine: lead.mine,
        p50: lead.p50,
        deltaPct: lead.deltaPct,
        drawing: lead.percentile >= 75 ? 'más' : lead.percentile <= 25 ? 'menos' : 'como',
      }
    : null;

  const insight = buildInsight(segment, span, summary, peers.length);

  return {
    cohort: {
      segment,
      months: span,
      windowLabel: `últimos ${span} meses (promedio mensual)`,
      population: peers.length,
    },
    summary,
    categories: rows,
    insight,
  };
}

export function buildInsight(segment, span, summary, population) {
  if (!summary) return 'No hay categorías con las que compararte en este periodo.';
  const pct = summary.percentile ?? 0;
  const dir =
    summary.percentile >= 75
      ? 'gastas más que la mayoría'
      : summary.percentile <= 25
        ? 'gastas menos que la mayoría'
        : 'tu gasto es parecido al de la mayoría';
  const vs = summary.deltaPct === null ? '' : ` (${summary.deltaPct >= 0 ? '+' : ''}${summary.deltaPct.toFixed(0)}% vs la mediana del segmento)`;
  return `Tu promedio mensual en ${summary.category} de los últimos ${span} meses es $${summary.mine.toLocaleString('es-MX')}, ${dir} de las personas ${segment}: estás en el percentil ${Math.round(pct)}${vs}. Se compara contra una población de ${population.toLocaleString('es-MX')} clientes del mismo segmento.`;
}
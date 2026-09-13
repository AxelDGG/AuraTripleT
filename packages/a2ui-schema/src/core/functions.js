// Renderer functions de Norte A2UI: la lista cerrada de funciones que un
// binding `{"call": "...", "args": {...}}` puede invocar en el cliente.
//
// Son puras, deterministas y sin acceso a nada fuera de sus argumentos. Es lo
// que permite que un slider recalcule una mensualidad en el teléfono sin
// volver al LLM: el modelo describe el cálculo una vez y el cliente lo repite
// cada vez que cambia el dato. Nunca se ejecuta código que venga del modelo,
// solo se elige una función de esta tabla.

import { formatCompact, formatCurrency, formatDate, formatNumber, formatPercent } from './format.js';

const num = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const list = (value) => (Array.isArray(value) ? value : []);
const numbers = (value) => list(value).map((v) => num(v));

// Pago mensual de un crédito a tasa fija (fórmula francesa). Tasa anual en %.
function monthlyPayment(amount, months, annualRate) {
  const principal = Math.abs(num(amount));
  const n = Math.max(1, Math.round(num(months, 1)));
  const rate = num(annualRate) / 100 / 12;
  if (rate <= 0) return principal / n;
  return (principal * rate) / (1 - Math.pow(1 + rate, -n));
}

// Tabla de amortización: saldo, interés y capital de cada mes.
function amortizationSchedule(amount, months, annualRate) {
  const principal = Math.abs(num(amount));
  const n = Math.max(1, Math.round(num(months, 1)));
  const rate = num(annualRate) / 100 / 12;
  const payment = monthlyPayment(principal, n, annualRate);
  const rows = [];
  let balance = principal;
  for (let i = 1; i <= n; i++) {
    const interest = balance * rate;
    const capital = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - capital);
    rows.push({ month: i, payment, interest, capital, balance });
  }
  return rows;
}

const round = (value, decimals = 2) => {
  const factor = Math.pow(10, Math.max(0, Math.min(6, num(decimals, 2))));
  return Math.round(num(value) * factor) / factor;
};

export const RENDERER_FUNCTIONS = {
  // ---------- formato ----------
  currency: ({ v, value, decimals }) => formatCurrency(v ?? value, { decimals: decimals === undefined ? 2 : num(decimals, 2) }),
  compact: ({ v, value }) => formatCompact(v ?? value),
  number: ({ v, value, decimals, unit }) => {
    const text = formatNumber(v ?? value, { decimals: decimals === undefined ? 2 : num(decimals, 2), trim: true });
    return unit ? `${text} ${unit}` : text;
  },
  percent: ({ v, value, decimals }) => formatPercent(v ?? value, { decimals: decimals === undefined ? 1 : num(decimals, 1) }),
  date: ({ v, value }) => formatDate(v ?? value),
  concat: ({ parts, separator }) => list(parts).map((p) => (p === undefined || p === null ? '' : String(p))).join(separator ?? ''),
  // "Pago de {payment} por {months} meses": las llaves se llenan con los args.
  template: ({ text, ...vars }) =>
    String(text ?? '').replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)),

  // ---------- aritmética ----------
  add: ({ a, b, values }) => (values ? numbers(values).reduce((s, v) => s + v, 0) : num(a) + num(b)),
  sub: ({ a, b }) => num(a) - num(b),
  mul: ({ a, b, values }) => (values ? numbers(values).reduce((s, v) => s * v, 1) : num(a) * num(b)),
  div: ({ a, b }) => (num(b) === 0 ? 0 : num(a) / num(b)),
  neg: ({ v, value }) => -num(v ?? value),
  abs: ({ v, value }) => Math.abs(num(v ?? value)),
  round: ({ v, value, decimals }) => round(v ?? value, decimals),
  sum: ({ values, items, key }) => (key ? list(items).reduce((s, it) => s + num(it && it[key]), 0) : numbers(values).reduce((s, v) => s + v, 0)),
  min: ({ values }) => (numbers(values).length ? Math.min(...numbers(values)) : 0),
  max: ({ values }) => (numbers(values).length ? Math.max(...numbers(values)) : 0),
  avg: ({ values }) => (numbers(values).length ? numbers(values).reduce((s, v) => s + v, 0) / numbers(values).length : 0),
  // Porcentaje que `part` representa de `total` (0-100).
  pct: ({ part, total, decimals }) => (num(total) === 0 ? 0 : round((num(part) / num(total)) * 100, decimals === undefined ? 1 : decimals)),
  clamp: ({ v, value, min, max }) => Math.min(num(max, Infinity), Math.max(num(min, -Infinity), num(v ?? value))),

  // ---------- colecciones ----------
  pluck: ({ items, key }) => list(items).map((it) => (it && typeof it === 'object' ? it[key] : undefined)),
  count: ({ items, values }) => list(items ?? values).length,
  first: ({ items }) => list(items)[0],
  last: ({ items }) => list(items)[list(items).length - 1],
  at: ({ items, index }) => list(items)[Math.trunc(num(index))],
  // Elemento cuyo `key` vale `value`: {call:'find', args:{items, key:'months', value:12}}.
  find: ({ items, key, value }) => list(items).find((it) => it && typeof it === 'object' && it[key] == value),
  // Campo de ese elemento en un solo paso.
  lookup: ({ items, key, value, field }) => {
    const hit = list(items).find((it) => it && typeof it === 'object' && it[key] == value);
    return hit ? hit[field] : undefined;
  },
  range: ({ from, to, step }) => {
    const start = num(from);
    const end = num(to);
    const inc = num(step, 1) || 1;
    const out = [];
    for (let v = start; inc > 0 ? v <= end : v >= end; v += inc) {
      out.push(v);
      if (out.length > 500) break;
    }
    return out;
  },

  // ---------- lógica ----------
  eq: ({ a, b }) => a == b,
  ne: ({ a, b }) => a != b,
  gt: ({ a, b }) => num(a) > num(b),
  gte: ({ a, b }) => num(a) >= num(b),
  lt: ({ a, b }) => num(a) < num(b),
  lte: ({ a, b }) => num(a) <= num(b),
  not: ({ v, value }) => !(v ?? value),
  and: ({ values }) => list(values).every(Boolean),
  or: ({ values }) => list(values).some(Boolean),
  if: ({ cond, then, else: otherwise }) => (cond ? then : otherwise),
  coalesce: ({ values }) => list(values).find((v) => v !== undefined && v !== null && v !== ''),

  // ---------- finanzas ----------
  // Mensualidad fija: amortize({amount, months, annualRate}).
  amortize: ({ amount, months, annualRate, rate }) => round(monthlyPayment(amount, months, annualRate ?? rate)),
  totalPayment: ({ amount, months, annualRate, rate }) => round(monthlyPayment(amount, months, annualRate ?? rate) * Math.max(1, Math.round(num(months, 1)))),
  totalInterest: ({ amount, months, annualRate, rate }) =>
    round(monthlyPayment(amount, months, annualRate ?? rate) * Math.max(1, Math.round(num(months, 1))) - Math.abs(num(amount))),
  // Serie por mes de la tabla de amortización: field = balance | interest | capital | payment.
  schedule: ({ amount, months, annualRate, rate, field }) =>
    amortizationSchedule(amount, months, annualRate ?? rate).map((row) => round(row[field in row ? field : 'balance'])),
  scheduleLabels: ({ months, prefix }) => {
    const n = Math.max(1, Math.round(num(months, 1)));
    return Array.from({ length: n }, (_, i) => `${prefix ?? 'Mes'} ${i + 1}`);
  },
  // Tasa efectiva anual a partir de la nominal (aprox. del CAT sin comisiones).
  effectiveAnnual: ({ annualRate, rate }) => round((Math.pow(1 + num(annualRate ?? rate) / 100 / 12, 12) - 1) * 100, 1),
  // Ahorro de intereses entre dos planes.
  interestSavings: ({ amount, months, annualRate, baselineMonths, baselineRate }) => {
    const plan = monthlyPayment(amount, months, annualRate) * Math.max(1, Math.round(num(months, 1))) - Math.abs(num(amount));
    const base = monthlyPayment(amount, baselineMonths, baselineRate) * Math.max(1, Math.round(num(baselineMonths, 1))) - Math.abs(num(amount));
    return round(base - plan);
  },
};

export const RENDERER_FUNCTION_NAMES = Object.keys(RENDERER_FUNCTIONS);

export function hasRendererFunction(name) {
  return Object.prototype.hasOwnProperty.call(RENDERER_FUNCTIONS, name);
}

// Ejecuta una función de la tabla. Una función desconocida o que lanza no
// tumba el render: devuelve undefined y el componente muestra su vacío.
export function callRendererFunction(name, args, functions = RENDERER_FUNCTIONS) {
  const fn = Object.prototype.hasOwnProperty.call(functions, name) ? functions[name] : null;
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(args && typeof args === 'object' ? args : {});
  } catch {
    return undefined;
  }
}

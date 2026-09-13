// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Formateo de cifras para las renderer functions de A2UI.
//
// Se arma a mano y no con Intl.NumberFormat: Hermes (React Native) no
// implementa `notation: 'compact'` y la ignora en silencio, y la salida tiene
// que ser idéntica en el navegador, en el teléfono y en los tests de Node. El
// estilo es el de es-MX: "$18,400.00", "32.4%", "$18.4 mil".

const toNumber = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

function group(integerText) {
  return integerText.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatNumber(value, { decimals = 2, trim = false } = {}) {
  const n = toNumber(value);
  if (n === null) return '—';
  const fixed = Math.abs(n).toFixed(Math.max(0, Math.min(6, decimals)));
  let [integer, fraction = ''] = fixed.split('.');
  if (trim) fraction = fraction.replace(/0+$/, '');
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${group(integer)}${fraction ? `.${fraction}` : ''}`;
}

export function formatCurrency(value, { decimals = 2, symbol = '$' } = {}) {
  const n = toNumber(value);
  if (n === null) return '—';
  const body = formatNumber(Math.abs(n), { decimals });
  return `${n < 0 ? '-' : ''}${symbol}${body}`;
}

export function formatPercent(value, { decimals = 1 } = {}) {
  const n = toNumber(value);
  if (n === null) return '—';
  return `${formatNumber(n, { decimals, trim: true })}%`;
}

const COMPACT_STEPS = [
  { limit: 1e12, divisor: 1e12, suffix: ' B' },
  { limit: 1e9, divisor: 1e9, suffix: ' mil M' },
  { limit: 1e6, divisor: 1e6, suffix: ' M' },
  { limit: 1e3, divisor: 1e3, suffix: ' mil' },
];

export function formatCompact(value, { currency = true } = {}) {
  const n = toNumber(value);
  if (n === null) return '—';
  const abs = Math.abs(n);
  const step = COMPACT_STEPS.find((candidate) => abs >= candidate.limit);
  const body = step
    ? `${formatNumber(abs / step.divisor, { decimals: 1, trim: true })}${step.suffix}`
    : formatNumber(abs, { decimals: 1, trim: true });
  return `${n < 0 ? '-' : ''}${currency ? '$' : ''}${body}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 'YYYY-MM-DD' → '12 sep'. Se parsea a mano para que la zona horaria no lo
// corra un día. Cualquier otra cosa se devuelve tal cual.
export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return value === undefined || value === null ? '' : String(value);
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ''}`.trim();
}

// Formateo compartido por toda la app. Español mexicano y pesos, igual que la web.

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const decimal = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

// La forma corta se arma a mano y NO con `notation: 'compact'` de Intl: Hermes
// no la implementa y la ignora en silencio, así que en el teléfono devolvía la
// notación larga con un decimal. El eje de la gráfica pedía "$50 mil" y recibía
// "$50,000.0", que no cabe en el canal del eje y salía cortado por la izquierda.
// En el navegador sí funciona, por eso la web no lo nota.
const short = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

const COMPACT_STEPS = [
  { limit: 1e12, divisor: 1e12, suffix: ' B' },
  { limit: 1e9, divisor: 1e9, suffix: ' mil M' },
  { limit: 1e6, divisor: 1e6, suffix: ' M' },
  { limit: 1e3, divisor: 1e3, suffix: ' mil' },
];

function compact(n) {
  const step = COMPACT_STEPS.find((candidate) => Math.abs(n) >= candidate.limit);
  return step ? `${short.format(n / step.divisor)}${step.suffix}` : short.format(n);
}

export const fmtMoney = (n) => (Number.isFinite(Number(n)) ? money.format(Number(n)) : '—');
export const fmtMoneyCompact = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  // El signo va antes del peso ("-$25 mil"), como lo escribe Intl.
  return num < 0 ? `-$${compact(-num)}` : `$${compact(num)}`;
};
export const fmtNumber = (n) => (Number.isFinite(Number(n)) ? decimal.format(Number(n)) : '—');
export const fmtNumberCompact = (n) => (Number.isFinite(Number(n)) ? compact(Number(n)) : '—');
export const fmtPercent = (n) => (Number.isFinite(Number(n)) ? `${decimal.format(Number(n))}%` : '—');

// Fechas: 'YYYY-MM-DD' se parsea a mano para que no se corra un día por zona horaria.
function toDate(value) {
  if (value instanceof Date) return value;
  const text = String(value ?? '');
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(value) {
  const date = toDate(value);
  if (!date) return String(value ?? '');
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// Formato del "Último ingreso" de la franja superior: 11-09-2026 12:05:34
export function fmtLoginStamp(value) {
  const date = toDate(value);
  if (!date) return null;
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function fmtRelative(value) {
  const date = toDate(value);
  if (!date) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return fmtDate(date);
}

// Formatea según el `format` que manda el agente en un componente chart.
export function fmtByKind(value, kind, unit) {
  switch (kind) {
    case 'percent': return fmtPercent(value);
    case 'number': return `${fmtNumber(value)}${unit ? ` ${unit}` : ''}`;
    case 'compact': return fmtMoneyCompact(value);
    default: return fmtMoney(value);
  }
}

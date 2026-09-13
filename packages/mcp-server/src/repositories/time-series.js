// Utilidades de series mensuales compartidas por los dos repositorios.
//
// `memory` las usa para calcular en JavaScript lo que `tiger` resuelve en SQL
// (continuous aggregates + TimescaleDB Toolkit); tener aquí la definición de la
// ventana de meses garantiza que los dos hablen de los mismos buckets.

const pad2 = (n) => String(n).padStart(2, '0');

// Primer instante (UTC) del mes `offset` meses después del mes de `date`.
function monthStart(date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

const monthKey = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

// Ventana de `months` meses calendario que termina en el mes de `now` (que
// suele estar incompleto). `lastComplete` es el mes anterior: el último cerrado,
// contra el que se compara la línea base de los meses previos.
export function monthWindow(now, months) {
  const span = Math.max(2, Math.trunc(months) || 2);
  const currentStart = monthStart(now, 0);
  const start = monthStart(now, -(span - 1));
  const list = [];
  for (let i = 0; i < span; i++) list.push(monthKey(monthStart(start, i)));
  return {
    months: list,
    first: list[0],
    current: list[list.length - 1],
    lastComplete: list[list.length - 2],
    start,
    end: monthStart(now, 1),
    lastCompleteStart: monthStart(now, -1),
    currentStart,
  };
}

// Promedio móvil de hasta `size` valores (incluido el actual): los primeros
// puntos promedian lo que hay, igual que la ventana ROWS ... PRECEDING de SQL.
export function movingAverage(values, size) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - size + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// Promedio y desviación estándar muestral (n − 1), como `stddev(stats_agg(x))`
// del Toolkit con su método por defecto. Con menos de dos valores no hay dispersión.
export function sampleStats(values) {
  if (!values.length) return { average: 0, stddev: 0 };
  const average = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 2) return { average, stddev: 0 };
  const variance = values.reduce((s, v) => s + (v - average) ** 2, 0) / (values.length - 1);
  return { average, stddev: Math.sqrt(variance) };
}

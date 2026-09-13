// Utilidades del motor de gráficas: normalizar lo que manda el agente,
// calcular escalas y construir rutas SVG.
//
// El LLM no siempre manda los datos perfectos (un dataset como número suelto,
// un valor en string, labels de más). Todo eso se endereza aquí una sola vez
// para que cada gráfica reciba números y ya.

import { chartColors, chartTokens } from '../theme/tokens';

export const palette = chartColors;
export const tokens = chartTokens;

export const colorAt = (index) => palette[index % palette.length];

// --- Normalización de la spec ---

export const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizeDatasets(component) {
  const raw = Array.isArray(component?.datasets) ? component.datasets : [];
  return raw
    .map((dataset, index) => {
      const data = Array.isArray(dataset?.data) ? dataset.data : [];
      return {
        label: typeof dataset?.label === 'string' ? dataset.label : `Serie ${index + 1}`,
        color: typeof dataset?.color === 'string' ? dataset.color : colorAt(index),
        kind: ['bar', 'line', 'area'].includes(dataset?.kind) ? dataset.kind : null,
        axis: dataset?.axis === 'right' ? 'right' : 'left',
        // Scatter y candlestick traen objetos; el resto, números.
        points: data,
        data: data.map(toNumber),
      };
    })
    .filter((dataset) => dataset.data.length > 0);
}

export function normalizeLabels(component, length) {
  const raw = Array.isArray(component?.labels) ? component.labels : [];
  return Array.from({ length }, (_, index) => String(raw[index] ?? index + 1));
}

// --- Escalas ---

// Dominio "bonito": redondea el tope a 1, 2, 2.5 o 5 por década para que las
// marcas del eje caigan en números que una persona lee sin esfuerzo.
export function niceCeil(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function domainFor(values, { includeZero = true } = {}) {
  const numbers = values.filter((n) => Number.isFinite(n));
  if (!numbers.length) return { min: 0, max: 1 };
  let max = Math.max(...numbers, includeZero ? 0 : -Infinity);
  let min = Math.min(...numbers, includeZero ? 0 : Infinity);
  if (max === min) {
    max = max === 0 ? 1 : max * 1.2;
    min = Math.min(0, min);
  }
  return {
    min: min < 0 ? -niceCeil(Math.abs(min)) : min,
    max: max > 0 ? niceCeil(max) : max,
  };
}

export function ticksFor({ min, max }, count = 4) {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

// Convierte un valor del dominio a coordenada Y dentro del área de dibujo.
export function makeScaleY({ min, max }, top, height) {
  const span = max - min || 1;
  return (value) => top + height - ((value - min) / span) * height;
}

// --- Rutas SVG ---

export function linePath(points, { smooth = false } = {}) {
  if (!points.length) return '';
  if (!smooth || points.length < 3) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  }
  // Curva de Catmull-Rom convertida a Bézier cúbica: suaviza sin inventar
  // valores fuera del rango real de los datos.
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

export function areaPath(points, baselineY, options) {
  if (!points.length) return '';
  const line = linePath(points, options);
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

// Arco de dona/pastel. `start` y `end` en radianes, 0 = arriba.
export function arcPath(cx, cy, outerRadius, innerRadius, start, end) {
  const clampedEnd = Math.min(end, start + Math.PI * 2 - 0.0001);
  const point = (radius, angle) => ({
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  });
  const large = clampedEnd - start > Math.PI ? 1 : 0;
  const outerStart = point(outerRadius, start);
  const outerEnd = point(outerRadius, clampedEnd);

  if (innerRadius <= 0) {
    return `M${cx} ${cy} L${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)} A${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)} Z`;
  }
  const innerEnd = point(innerRadius, clampedEnd);
  const innerStart = point(innerRadius, start);
  return [
    `M${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Etiquetas de eje X: con muchas categorías se muestran salteadas para que no
// se encimen. Devuelve los índices que sí se dibujan.
export function visibleTickIndices(count, maxTicks = 6) {
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / maxTicks);
  const indices = [];
  for (let i = 0; i < count; i += step) indices.push(i);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
  return indices;
}

// Gráficas radiales y de forma: pastel, dona, anillo de meta, gauge, radar y
// embudo. Son las que responden "¿cómo se reparte?" y "¿cómo voy?", que en una
// app de finanzas personales es la mitad de las preguntas.

import { G, Circle, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { fmtByKind } from '../lib/format';
import { arcPath, colorAt, domainFor, linePath, tokens } from './scale';

const TAU = Math.PI * 2;

// ---------- Pastel y dona ----------

export function PieDonut({ width, height, labels, datasets, colors, hole = 0 }) {
  const values = (datasets[0]?.data ?? []).map((value) => Math.max(value, 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return null;

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const outer = size / 2 - 4;
  const inner = outer * hole;

  let cursor = 0;
  return (
    <G>
      {values.map((value, index) => {
        const start = cursor;
        const end = start + (value / total) * TAU;
        cursor = end;
        const fill = colors?.[index] ?? colorAt(index);
        return <Path key={index} d={arcPath(cx, cy, outer, inner, start, end)} fill={fill} />;
      })}
      {hole > 0 ? (
        <SvgText
          x={cx}
          y={cy + 5}
          fontSize={13}
          fill={tokens.axis}
          textAnchor="middle"
          fontFamily="Manrope_800ExtraBold"
        >
          {labels.length}
        </SvgText>
      ) : null}
    </G>
  );
}

// ---------- Anillo de meta ----------
//
// Un solo número contra su objetivo. El arco arranca arriba y avanza en el
// sentido del reloj; el centro dice el porcentaje porque es lo que se lee de un
// vistazo.

export function Ring({ width, height, value, max, label, format, unit }) {
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 12;
  const thickness = Math.max(size * 0.11, 10);
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  return (
    <G>
      <Circle cx={cx} cy={cy} r={radius} stroke={tokens.track} strokeWidth={thickness} fill="none" />
      <Path
        d={arcPath(cx, cy, radius + thickness / 2, radius - thickness / 2, 0, ratio * TAU)}
        fill={tokens.negative}
      />
      <SvgText x={cx} y={cy + 2} fontSize={size * 0.17} fill="#1b1b20" textAnchor="middle" fontFamily="Manrope_800ExtraBold">
        {`${Math.round(ratio * 100)}%`}
      </SvgText>
      <SvgText x={cx} y={cy + size * 0.16} fontSize={10} fill={tokens.axis} textAnchor="middle" fontFamily="Manrope_500Medium">
        {label ?? fmtByKind(value, format, unit)}
      </SvgText>
    </G>
  );
}

// ---------- Gauge ----------
//
// Arco de 270° con muescas: mide un indicador contra su límite sano (uso de
// línea de crédito, score). Se pinta en verde, ámbar o rojo según qué tan cerca
// está del tope, porque ese semáforo es la información, no un adorno.

const GAUGE_SWEEP = Math.PI * 1.5;
const GAUGE_START = -GAUGE_SWEEP / 2;

export function Gauge({ width, height, value, max, label, format, unit }) {
  const size = Math.min(width, height * 1.25);
  const cx = width / 2;
  const cy = height / 2 + size * 0.08;
  const radius = size / 2 - 14;
  const thickness = Math.max(size * 0.1, 9);
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const fill = ratio < 0.5 ? tokens.positive : ratio < 0.8 ? '#b8770a' : tokens.negative;

  const notches = Array.from({ length: 11 }, (_, index) => {
    const angle = GAUGE_START + (index / 10) * GAUGE_SWEEP;
    const outer = radius + thickness / 2 + 3;
    const inner = radius + thickness / 2 + (index % 5 === 0 ? 8 : 6);
    return {
      x1: cx + outer * Math.sin(angle),
      y1: cy - outer * Math.cos(angle),
      x2: cx + inner * Math.sin(angle),
      y2: cy - inner * Math.cos(angle),
      strong: index % 5 === 0,
    };
  });

  return (
    <G>
      <Path
        d={arcPath(cx, cy, radius + thickness / 2, radius - thickness / 2, GAUGE_START, GAUGE_START + GAUGE_SWEEP)}
        fill={tokens.track}
      />
      <Path
        d={arcPath(cx, cy, radius + thickness / 2, radius - thickness / 2, GAUGE_START, GAUGE_START + ratio * GAUGE_SWEEP)}
        fill={fill}
      />
      {notches.map((notch, index) => (
        <Line
          key={index}
          x1={notch.x1}
          y1={notch.y1}
          x2={notch.x2}
          y2={notch.y2}
          stroke={tokens.grid}
          strokeWidth={notch.strong ? 1.4 : 0.9}
        />
      ))}
      <SvgText x={cx} y={cy - 2} fontSize={size * 0.16} fill="#1b1b20" textAnchor="middle" fontFamily="Manrope_800ExtraBold">
        {fmtByKind(value, format, unit)}
      </SvgText>
      <SvgText x={cx} y={cy + size * 0.14} fontSize={10} fill={tokens.axis} textAnchor="middle" fontFamily="Manrope_500Medium">
        {label ?? `de ${fmtByKind(max, format, unit)}`}
      </SvgText>
    </G>
  );
}

// ---------- Radar ----------

export function Radar({ width, height, labels, datasets }) {
  const axes = labels.length;
  if (axes < 3) return null;

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 22;
  const domain = domainFor(datasets.flatMap((d) => d.data));
  const max = domain.max || 1;

  const pointAt = (index, ratio) => {
    const angle = (index / axes) * TAU;
    return { x: cx + radius * ratio * Math.sin(angle), y: cy - radius * ratio * Math.cos(angle) };
  };

  return (
    <G>
      {[0.25, 0.5, 0.75, 1].map((ring, ringIndex) => (
        <Polygon
          key={ringIndex}
          points={labels
            .map((_, index) => {
              const point = pointAt(index, ring);
              return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
            })
            .join(' ')}
          fill="none"
          stroke={tokens.grid}
          strokeWidth={1}
        />
      ))}
      {labels.map((text, index) => {
        const point = pointAt(index, 1.14);
        return (
          <SvgText
            key={index}
            x={point.x}
            y={point.y + 3}
            fontSize={9}
            fill={tokens.axis}
            textAnchor="middle"
            fontFamily="Manrope_500Medium"
          >
            {text}
          </SvgText>
        );
      })}
      {datasets.map((dataset, seriesIndex) => (
        <Polygon
          key={seriesIndex}
          points={labels
            .map((_, index) => {
              const point = pointAt(index, Math.max((dataset.data[index] ?? 0) / max, 0));
              return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
            })
            .join(' ')}
          fill={dataset.color}
          fillOpacity={0.18}
          stroke={dataset.color}
          strokeWidth={2}
        />
      ))}
    </G>
  );
}

// ---------- Embudo ----------

export function Funnel({ width, height, labels, datasets, format, unit }) {
  const values = datasets[0]?.data ?? [];
  if (!values.length) return null;

  const max = Math.max(...values.map(Math.abs), 1);
  const rowHeight = (height - 6) / values.length;
  const barHeight = Math.min(rowHeight * 0.72, 34);

  return (
    <G>
      {values.map((value, index) => {
        const ratio = Math.max(Math.abs(value) / max, 0.05);
        const barWidth = ratio * (width - 8);
        const x = (width - barWidth) / 2;
        const y = 3 + rowHeight * index + (rowHeight - barHeight) / 2;
        return (
          <G key={index}>
            <Rect x={x} y={y} width={barWidth} height={barHeight} rx={5} fill={colorAt(index)} fillOpacity={0.92} />
            <SvgText
              x={width / 2}
              y={y + barHeight / 2 + 4}
              fontSize={10.5}
              fill="#ffffff"
              textAnchor="middle"
              fontFamily="Manrope_700Bold"
            >
              {`${labels[index] ?? ''} · ${fmtByKind(value, format === 'currency' ? 'compact' : format, unit)}`}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

// Re-export para que Chart.js tenga un solo punto de importación.
export { linePath };

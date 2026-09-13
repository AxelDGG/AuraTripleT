// Gráficas de forma menos común: dispersión, velas y heatmap.
//
// Viven aparte de cartesian.js por tamaño (el proyecto pide archivos de menos
// de 400 líneas), no por ser distintas: comparten el mismo marco de ejes y se
// importan de ahí.

import { Circle, G, Rect, Line, Text as SvgText } from 'react-native-svg';
import { domainFor, makeScaleY, tokens, visibleTickIndices } from './scale';
import { Frame, PAD, XLabels } from './cartesian';

// ---------- Dispersión ----------

export function Scatter({ width, height, datasets, format, unit }) {
  const points = datasets.flatMap((dataset, seriesIndex) =>
    dataset.points.map((point) => ({
      x: Number(point?.x ?? 0),
      y: Number(point?.y ?? 0),
      color: dataset.color,
      seriesIndex,
    })),
  );
  if (!points.length) return null;

  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const domainY = domainFor(points.map((p) => p.y));
  const domainX = domainFor(points.map((p) => p.x));
  const scaleY = makeScaleY(domainY, PAD.top, plotHeight);
  const spanX = domainX.max - domainX.min || 1;
  const scaleX = (value) => PAD.left + ((value - domainX.min) / spanX) * plotWidth;

  return (
    <G>
      <Frame width={width} height={height} domain={domainY} format={format} unit={unit} showZero={domainY.min < 0} />
      {points.map((point, index) => (
        <Circle key={index} cx={scaleX(point.x)} cy={scaleY(point.y)} r={4} fill={point.color} fillOpacity={0.75} />
      ))}
    </G>
  );
}

// ---------- Velas ----------

export function Candles({ width, height, labels, datasets, format, unit }) {
  const candles = (datasets[0]?.points ?? []).map((point) => ({
    o: Number(point?.o ?? 0),
    h: Number(point?.h ?? 0),
    l: Number(point?.l ?? 0),
    c: Number(point?.c ?? 0),
  }));
  if (!candles.length) return null;

  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const domain = domainFor(candles.flatMap((c) => [c.h, c.l]), { includeZero: false });
  const scaleY = makeScaleY(domain, PAD.top, plotHeight);
  const slot = plotWidth / candles.length;
  const bodyWidth = Math.max(slot * 0.5, 3);

  return (
    <G>
      <Frame width={width} height={height} domain={domain} format={format} unit={unit} showZero={false} />
      {candles.map((candle, index) => {
        const center = PAD.left + slot * index + slot / 2;
        const rising = candle.c >= candle.o;
        const fill = rising ? tokens.positive : tokens.negative;
        const top = scaleY(Math.max(candle.o, candle.c));
        const bottom = scaleY(Math.min(candle.o, candle.c));
        return (
          <G key={index}>
            <Line x1={center} y1={scaleY(candle.h)} x2={center} y2={scaleY(candle.l)} stroke={fill} strokeWidth={1.2} />
            <Rect
              x={center - bodyWidth / 2}
              y={top}
              width={bodyWidth}
              height={Math.max(bottom - top, 1.5)}
              rx={1.5}
              fill={fill}
            />
          </G>
        );
      })}
      <XLabels labels={labels} width={width} height={height} slotWidth={slot} />
    </G>
  );
}

// ---------- Heatmap ----------

export function Heatmap({ width, height, labels, datasets }) {
  const rows = datasets.length;
  if (!rows) return null;
  const columns = Math.max(...datasets.map((d) => d.data.length), 1);
  const labelWidth = 56;
  const cellWidth = (width - labelWidth - 6) / columns;
  const cellHeight = Math.min((height - 20) / rows, 30);
  const max = Math.max(...datasets.flatMap((d) => d.data.map(Math.abs)), 1);

  return (
    <G>
      {datasets.map((dataset, rowIndex) => (
        <G key={rowIndex}>
          <SvgText
            x={labelWidth - 8}
            y={6 + cellHeight * rowIndex + cellHeight / 2 + 3.5}
            fontSize={9.5}
            fill={tokens.axis}
            textAnchor="end"
            fontFamily="Manrope_500Medium"
          >
            {dataset.label}
          </SvgText>
          {dataset.data.map((value, columnIndex) => (
            <Rect
              key={columnIndex}
              x={labelWidth + cellWidth * columnIndex + 1}
              y={6 + cellHeight * rowIndex + 1}
              width={Math.max(cellWidth - 2, 1)}
              height={Math.max(cellHeight - 2, 1)}
              rx={3}
              fill={tokens.negative}
              fillOpacity={0.12 + (Math.abs(value) / max) * 0.85}
            />
          ))}
        </G>
      ))}
      {visibleTickIndices(columns, 7).map((index) => (
        <SvgText
          key={index}
          x={labelWidth + cellWidth * index + cellWidth / 2}
          y={6 + cellHeight * rows + 12}
          fontSize={9}
          fill={tokens.axis}
          textAnchor="middle"
          fontFamily="Manrope_500Medium"
        >
          {labels[index] ?? index + 1}
        </SvgText>
      ))}
    </G>
  );
}

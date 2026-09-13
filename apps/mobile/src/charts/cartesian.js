// Gráficas con ejes: barras, barras apiladas, barras horizontales, línea, área,
// compuesta y resultado (la que cruza el cero).
//
// Todas comparten el mismo marco: cuadrícula al fondo, eje Y con cuatro marcas
// formateadas según el `format` que pidió el agente, y eje X salteado cuando
// hay más categorías que espacio. Ese marco (`Frame`, `XLabels`, `PAD`) también
// lo usan las gráficas de special.js, por eso se exporta.

import { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fmtByKind, fmtMoneyCompact, fmtNumberCompact, fmtPercent } from '../lib/format';
import {
  areaPath,
  domainFor,
  linePath,
  makeScaleY,
  ticksFor,
  tokens,
  visibleTickIndices,
} from './scale';

const AXIS_FONT = 9.5;
export const PAD = { top: 10, right: 10, bottom: 22, left: 46 };

export const label = (value, format, unit) => fmtByKind(value, format, unit);

// Las marcas del eje Y siempre van en forma corta: el canal que les toca es de
// unos 40px y "$100,000.00" no cabe ahí, se corta por la izquierda.
export const axisLabel = (value, format, unit) => {
  if (format === 'percent') return fmtPercent(value);
  if (format === 'number') return `${fmtNumberCompact(value)}${unit ? ` ${unit}` : ''}`;
  return fmtMoneyCompact(value);
};

// Marco común: cuadrícula horizontal + marcas del eje Y.
export function Frame({ width, height, domain, format, unit, showZero }) {
  const plotHeight = height - PAD.top - PAD.bottom;
  const scaleY = makeScaleY(domain, PAD.top, plotHeight);
  return (
    <G>
      {ticksFor(domain).map((tick, index) => {
        const y = scaleY(tick);
        const isZero = showZero && Math.abs(tick) < 1e-9;
        return (
          <G key={index}>
            <Line
              x1={PAD.left}
              y1={y}
              x2={width - PAD.right}
              y2={y}
              stroke={isZero ? tokens.axis : tokens.grid}
              strokeWidth={isZero ? 1 : 1}
            />
            <SvgText
              x={PAD.left - 6}
              y={y + 3}
              fontSize={AXIS_FONT}
              fill={tokens.axis}
              textAnchor="end"
              fontFamily="Manrope_500Medium"
            >
              {axisLabel(tick, format, unit)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

export function XLabels({ labels, width, height, slotWidth, offset = 0 }) {
  const indices = visibleTickIndices(labels.length);
  return (
    <G>
      {indices.map((index) => (
        <SvgText
          key={index}
          x={PAD.left + offset + slotWidth * index + slotWidth / 2}
          y={height - PAD.bottom + 14}
          fontSize={AXIS_FONT}
          fill={tokens.axis}
          textAnchor="middle"
          fontFamily="Manrope_500Medium"
        >
          {labels[index]}
        </SvgText>
      ))}
    </G>
  );
}

// ---------- Barras (agrupadas, apiladas y de resultado) ----------

export function Bars({ width, height, labels, datasets, format, unit, stacked, signed }) {
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const count = labels.length || 1;
  const slot = plotWidth / count;

  const values = stacked
    ? labels.map((_, i) => datasets.reduce((sum, d) => sum + (d.data[i] ?? 0), 0))
    : datasets.flatMap((d) => d.data);
  const domain = domainFor(values);
  const scaleY = makeScaleY(domain, PAD.top, plotHeight);
  const zeroY = scaleY(0);

  const groupWidth = slot * 0.66;
  const barWidth = stacked ? groupWidth : groupWidth / Math.max(datasets.length, 1);

  return (
    <G>
      <Frame width={width} height={height} domain={domain} format={format} unit={unit} showZero={signed} />
      {labels.map((_, index) => {
        const left = PAD.left + slot * index + (slot - groupWidth) / 2;
        if (stacked) {
          let cursor = 0;
          return datasets.map((dataset, seriesIndex) => {
            const value = dataset.data[index] ?? 0;
            const top = scaleY(cursor + value);
            const bottom = scaleY(cursor);
            cursor += value;
            return (
              <Rect
                key={`${index}-${seriesIndex}`}
                x={left}
                y={Math.min(top, bottom)}
                width={barWidth}
                height={Math.max(Math.abs(bottom - top), 1)}
                rx={2}
                fill={dataset.color}
              />
            );
          });
        }
        return datasets.map((dataset, seriesIndex) => {
          const value = dataset.data[index] ?? 0;
          const y = scaleY(value);
          // En una gráfica de resultado el color lo define el signo, no la serie.
          const fill = signed ? (value >= 0 ? tokens.positive : tokens.negative) : dataset.color;
          return (
            <Rect
              key={`${index}-${seriesIndex}`}
              x={left + barWidth * seriesIndex}
              y={Math.min(y, zeroY)}
              width={Math.max(barWidth - 2, 2)}
              height={Math.max(Math.abs(zeroY - y), 1)}
              rx={3}
              fill={fill}
            />
          );
        });
      })}
      <XLabels labels={labels} width={width} height={height} slotWidth={slot} />
    </G>
  );
}

// ---------- Barras horizontales (rankings) ----------

export function HorizontalBars({ width, height, labels, datasets, format, unit }) {
  const dataset = datasets[0];
  if (!dataset) return null;

  const labelWidth = Math.min(Math.max(...labels.map((l) => l.length)) * 5.6 + 8, width * 0.4);
  const plotWidth = width - labelWidth - 52;
  const rows = labels.length || 1;
  const rowHeight = (height - 8) / rows;
  const barHeight = Math.min(rowHeight * 0.56, 20);
  const max = Math.max(...dataset.data.map(Math.abs), 1);

  return (
    <G>
      {labels.map((text, index) => {
        const value = dataset.data[index] ?? 0;
        const y = 4 + rowHeight * index + (rowHeight - barHeight) / 2;
        const barLength = Math.max((Math.abs(value) / max) * plotWidth, 2);
        return (
          <G key={index}>
            <SvgText
              x={labelWidth - 8}
              y={y + barHeight / 2 + 3.5}
              fontSize={10}
              fill={tokens.axis}
              textAnchor="end"
              fontFamily="Manrope_500Medium"
            >
              {text}
            </SvgText>
            <Rect x={labelWidth} y={y} width={plotWidth} height={barHeight} rx={barHeight / 2} fill={tokens.track} />
            <Rect x={labelWidth} y={y} width={barLength} height={barHeight} rx={barHeight / 2} fill={dataset.color} />
            <SvgText
              x={labelWidth + barLength + 6}
              y={y + barHeight / 2 + 3.5}
              fontSize={9.5}
              fill={tokens.axis}
              fontFamily="Manrope_600SemiBold"
            >
              {label(value, format === 'currency' ? 'compact' : format, unit)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

// ---------- Línea, área y compuesta ----------

export function LineArea({ width, height, labels, datasets, format, unit, filled, target, targetLabel }) {
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const count = Math.max(labels.length, 1);
  const step = count > 1 ? plotWidth / (count - 1) : 0;

  const allValues = datasets.flatMap((d) => d.data);
  if (Number.isFinite(target)) allValues.push(Number(target));
  const domain = domainFor(allValues);
  const scaleY = makeScaleY(domain, PAD.top, plotHeight);
  const baseline = scaleY(Math.max(domain.min, 0));

  return (
    <G>
      <Frame width={width} height={height} domain={domain} format={format} unit={unit} showZero={domain.min < 0} />
      {datasets.map((dataset, seriesIndex) => {
        const points = dataset.data.map((value, index) => ({
          x: PAD.left + (count > 1 ? step * index : plotWidth / 2),
          y: scaleY(value),
        }));
        return (
          <G key={seriesIndex}>
            {filled ? (
              <Path d={areaPath(points, baseline, { smooth: true })} fill={dataset.color} fillOpacity={0.16} />
            ) : null}
            <Path
              d={linePath(points, { smooth: true })}
              fill="none"
              stroke={dataset.color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.length <= 14
              ? points.map((point, index) => (
                  <Circle key={index} cx={point.x} cy={point.y} r={2.8} fill={dataset.color} />
                ))
              : null}
          </G>
        );
      })}
      {Number.isFinite(target) ? (
        <G>
          <Line
            x1={PAD.left}
            y1={scaleY(Number(target))}
            x2={width - PAD.right}
            y2={scaleY(Number(target))}
            stroke={tokens.axis}
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
          {targetLabel ? (
            <SvgText
              x={width - PAD.right}
              y={scaleY(Number(target)) - 5}
              fontSize={9}
              fill={tokens.axis}
              textAnchor="end"
              fontFamily="Manrope_600SemiBold"
            >
              {targetLabel}
            </SvgText>
          ) : null}
        </G>
      ) : null}
      <XLabels
        labels={labels}
        width={width}
        height={height}
        slotWidth={count > 1 ? step : plotWidth}
        offset={count > 1 ? -step / 2 : 0}
      />
    </G>
  );
}

// Compuesta: cada dataset decide si es barra o línea. Las series marcadas con
// axis:"right" se escalan aparte, que es justo para lo que existe este tipo.
export function Composed({ width, height, labels, datasets, format, unit }) {
  const bars = datasets.filter((d) => d.kind !== 'line' && d.kind !== 'area');
  const lines = datasets.filter((d) => d.kind === 'line' || d.kind === 'area');
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const count = labels.length || 1;
  const slot = plotWidth / count;

  const leftDomain = domainFor(bars.flatMap((d) => d.data));
  const rightSeries = lines.filter((d) => d.axis === 'right');
  const rightDomain = rightSeries.length ? domainFor(rightSeries.flatMap((d) => d.data)) : leftDomain;
  const scaleLeft = makeScaleY(leftDomain, PAD.top, plotHeight);
  const scaleRight = makeScaleY(rightDomain, PAD.top, plotHeight);
  const barWidth = (slot * 0.62) / Math.max(bars.length, 1);

  return (
    <G>
      <Frame width={width} height={height} domain={leftDomain} format={format} unit={unit} showZero={leftDomain.min < 0} />
      {labels.map((_, index) =>
        bars.map((dataset, seriesIndex) => {
          const value = dataset.data[index] ?? 0;
          const y = scaleLeft(value);
          const zero = scaleLeft(0);
          return (
            <Rect
              key={`${index}-${seriesIndex}`}
              x={PAD.left + slot * index + (slot - barWidth * bars.length) / 2 + barWidth * seriesIndex}
              y={Math.min(y, zero)}
              width={Math.max(barWidth - 2, 2)}
              height={Math.max(Math.abs(zero - y), 1)}
              rx={3}
              fill={dataset.color}
            />
          );
        }),
      )}
      {lines.map((dataset, seriesIndex) => {
        const scale = dataset.axis === 'right' ? scaleRight : scaleLeft;
        const points = dataset.data.map((value, index) => ({
          x: PAD.left + slot * index + slot / 2,
          y: scale(value),
        }));
        return (
          <Path
            key={seriesIndex}
            d={linePath(points, { smooth: true })}
            fill="none"
            stroke={dataset.color}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        );
      })}
      <XLabels labels={labels} width={width} height={height} slotWidth={slot} />
    </G>
  );
}

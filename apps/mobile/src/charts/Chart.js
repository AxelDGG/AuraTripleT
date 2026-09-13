// Componente `chart` de Norte UI Spec.
//
// Recibe la spec tal cual la emitió el agente y decide qué dibujar. El catálogo
// de tipos es el mismo de packages/a2ui-schema (16 tipos): si la web sabe
// pintarlo, la app también, porque el contrato es uno solo.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { Text } from '../components/ui';
import { color, radius, space } from '../theme/tokens';
import { colorAt, normalizeDatasets, normalizeLabels, toNumber } from './scale';
import { Bars, Composed, HorizontalBars, LineArea } from './cartesian';
import { Candles, Heatmap, Scatter } from './special';
import { Funnel, Gauge, PieDonut, Radar, Ring } from './radial';

// Alto por tipo: las radiales piden cuadrado, los rankings crecen con las filas.
//
// En modo compacto (la miniatura del historial) cada fila ocupa menos y el tope
// de filas visibles baja. No se escala la gráfica con `transform`: una escala no
// cambia el alto que la vista ocupa en el layout, así que la miniatura acababa
// derramándose sobre el pie de la tarjeta. Aquí el alto que se calcula es el
// alto real que se va a ocupar.
function heightFor(type, { rows, compact }) {
  // En compacto solo encoge la unidad (la fila, el cuadrado), nunca el tope de
  // filas: recortar filas y repartir el mismo alto entre todas las aplastaría,
  // que es exactamente el efecto que se estaba corrigiendo.
  const rowHeight = compact ? 24 : 30;
  switch (type) {
    case 'ring':
    case 'gauge':
    case 'pie':
    case 'doughnut':
    case 'radar':
      return compact ? 150 : 190;
    case 'horizontal_bar':
      return Math.max(Math.min(rows, 10) * rowHeight + 12, compact ? 92 : 110);
    case 'funnel':
      return Math.max(Math.min(rows, 8) * (compact ? 34 : 42), compact ? 110 : 130);
    case 'heatmap':
      return Math.max(Math.min(rows, 8) * rowHeight + 28, compact ? 100 : 120);
    default:
      return compact ? 150 : 190;
  }
}

// Cuántas entradas de leyenda caben sin que la miniatura crezca de más.
const COMPACT_LEGEND_MAX = 4;

export default function Chart({ component, compact = false }) {
  const [width, setWidth] = useState(0);

  const type = typeof component?.chartType === 'string' ? component.chartType : 'bar';
  const datasets = normalizeDatasets(component);
  const longest = Math.max(...datasets.map((d) => d.data.length), 0);
  const labels = normalizeLabels(component, longest || (Array.isArray(component?.labels) ? component.labels.length : 0));
  const format = ['currency', 'percent', 'number', 'compact'].includes(component?.format)
    ? component.format
    : 'currency';
  const unit = typeof component?.unit === 'string' ? component.unit : undefined;

  // ring y gauge no traen datasets: su dato es value + max.
  const isMeter = type === 'ring' || type === 'gauge';
  const value = toNumber(component?.value);
  const max = toNumber(component?.max) || 100;

  const rows = type === 'horizontal_bar' || type === 'funnel' ? labels.length : datasets.length;
  const height = heightFor(type, { rows, compact });

  const hasData = isMeter ? Number.isFinite(value) : datasets.length > 0;

  const allLegend =
    component?.legend !== false && !isMeter && datasets.length > 1
      ? datasets.map((dataset, index) => ({ label: dataset.label, color: dataset.color ?? colorAt(index) }))
      : type === 'pie' || type === 'doughnut'
        ? labels.map((label, index) => ({ label, color: colorAt(index) }))
        : [];
  const legend = compact ? allLegend.slice(0, COMPACT_LEGEND_MAX) : allLegend;

  function renderChart() {
    const shared = { width, height, labels, datasets, format, unit };
    switch (type) {
      case 'stacked_bar':
        return <Bars {...shared} stacked />;
      case 'horizontal_bar':
        return <HorizontalBars {...shared} />;
      case 'profit_loss':
        return <Bars {...shared} signed />;
      case 'line':
        return <LineArea {...shared} target={component?.target} targetLabel={component?.targetLabel} />;
      case 'area':
        return <LineArea {...shared} filled target={component?.target} targetLabel={component?.targetLabel} />;
      case 'composed':
        return <Composed {...shared} />;
      case 'pie':
        return <PieDonut {...shared} colors={component?.colors} />;
      case 'doughnut':
        return <PieDonut {...shared} colors={component?.colors} hole={0.58} />;
      case 'ring':
        return <Ring {...shared} value={value} max={max} label={component?.label} />;
      case 'gauge':
        return <Gauge {...shared} value={value} max={max} label={component?.label} />;
      case 'radar':
        return <Radar {...shared} />;
      case 'scatter':
        return <Scatter {...shared} />;
      case 'funnel':
        return <Funnel {...shared} />;
      case 'heatmap':
        return <Heatmap {...shared} />;
      case 'candlestick':
        return <Candles {...shared} />;
      case 'bar':
      default:
        return <Bars {...shared} stacked={component?.stacked === true} />;
    }
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {component?.title ? <Text variant="h3">{component.title}</Text> : null}
      {component?.subtitle ? (
        <Text variant="small" style={styles.subtitle}>
          {component.subtitle}
        </Text>
      ) : null}

      <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && hasData ? (
          <Svg width={width} height={height}>
            {renderChart()}
          </Svg>
        ) : (
          <View style={[styles.placeholder, { height }]}>
            {!hasData ? (
              <Text variant="small">Sin datos para graficar.</Text>
            ) : null}
          </View>
        )}
      </View>

      {legend.length ? (
        <View style={[styles.legend, compact && styles.legendCompact]}>
          {legend.map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <Text variant="small" numberOfLines={1} style={styles.legendLabel}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {component?.caption ? (
        <Text variant="small" style={styles.caption}>
          {component.caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
    gap: space.sm,
  },
  // La miniatura ya vive dentro de una tarjeta: repetir marco, fondo y relleno
  // la haría verse como una tarjeta dentro de otra.
  cardCompact: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    gap: 6,
  },
  subtitle: { marginTop: -4 },
  plot: { width: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: 2 },
  legendCompact: { gap: space.sm, marginTop: 0 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flexShrink: 1 },
  caption: { marginTop: 2 },
});

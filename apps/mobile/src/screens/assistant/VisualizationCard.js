// La tarjeta de una visualización archivada.
//
// Vive fuera de Historial porque Colecciones muestra exactamente lo mismo al
// desplegar una carpeta: si fueran dos componentes, la misma visualización se
// vería de dos maneras según por dónde se llegara a ella.
//
// La miniatura se dibuja con los mismos componentes que la vista grande (la
// gráfica es la gráfica real, no una imagen), así que reconocer una
// visualización pasada es inmediato. Tocarla la vuelve a abrir sin gastar una
// llamada al LLM.

import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Chip, Text } from '../../components/ui';
import Chart from '../../charts/Chart';
import { color, space } from '../../theme/tokens';
import { fmtRelative } from '../../lib/format';

const TYPE_LABELS = {
  header: 'Encabezado',
  kpi_grid: 'Métricas',
  balance_cards: 'Cuentas',
  chart: 'Gráfica',
  table: 'Tabla',
  transaction_list: 'Movimientos',
  form: 'Formulario',
  alert: 'Aviso',
  progress: 'Avance',
  text: 'Texto',
};

// La miniatura: si la visualización tenía una gráfica, esa gráfica es el
// resumen más honesto. Si no, se listan los componentes que la formaban.
//
// La gráfica se dibuja en modo compacto, no encogida con `transform`: una
// escala deja el alto original reservado en el layout y la miniatura terminaba
// pasando por encima del título de la tarjeta.
function Preview({ spec }) {
  const components = Array.isArray(spec?.ui) ? spec.ui : [];
  const chart = components.find((component) => component?.type === 'chart');
  const types = [...new Set(components.map((component) => component?.type).filter(Boolean))];

  if (chart) {
    return (
      <View style={styles.preview} pointerEvents="none">
        <Chart component={{ ...chart, title: undefined, subtitle: undefined, caption: undefined }} compact />
      </View>
    );
  }

  return (
    <View style={[styles.preview, styles.previewPlain]} pointerEvents="none">
      {spec?.message ? (
        <Text variant="small" numberOfLines={3} style={{ color: color.ink2 }}>
          {spec.message}
        </Text>
      ) : null}
      <View style={styles.previewTypes}>
        {types.slice(0, 4).map((type) => (
          <Chip key={type} label={TYPE_LABELS[type] ?? type} />
        ))}
      </View>
    </View>
  );
}

export default function VisualizationCard({ entry, onOpen, showFolder = true }) {
  return (
    <Pressable
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${entry.title}`}
      style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }]}
    >
      <Card padded={false} style={styles.card}>
        <Preview spec={entry.spec} />
        <View style={styles.cardFoot}>
          <Text variant="h3" numberOfLines={2} style={{ textAlign: 'center' }}>
            {entry.title}
          </Text>
          <Text variant="tiny" style={{ textAlign: 'center' }}>
            {[showFolder ? entry.folder : null, fmtRelative(entry.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  // Sin alto fijo: la miniatura mide lo que mide la gráfica compacta.
  preview: { padding: space.lg, paddingBottom: space.md, justifyContent: 'center', backgroundColor: color.surface },
  previewPlain: { gap: space.sm, backgroundColor: color.surface2, minHeight: 96 },
  previewTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardFoot: { padding: space.lg, gap: 3, borderTopWidth: 1, borderTopColor: color.line },
});

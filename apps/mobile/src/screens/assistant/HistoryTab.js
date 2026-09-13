// Pestaña Historial: cada interfaz que el agente ha construido, más reciente
// primero, con una miniatura de cómo se veía.
//
// La tarjeta es la misma que usa Colecciones (VisualizationCard), así que una
// visualización se ve igual sin importar por dónde se llegó a ella.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { EmptyState, ErrorBanner, Loading, ScrollFade, Text } from '../../components/ui';
import Icon from '../../components/Icon';
import VisualizationCard from './VisualizationCard';
import { color, radius, space } from '../../theme/tokens';

export default function HistoryTab({ history, onOpen, contentPadding }) {
  const [search, setSearch] = useState('');
  const { entries, loading, error, source } = history;

  const filtered = search.trim()
    ? entries.filter((entry) => entry.title?.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={color.onRedMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="BUSCAR..."
            placeholderTextColor={color.onRedMuted}
            autoCapitalize="none"
            accessibilityLabel="Buscar en el historial"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
              <Icon name="close" size={17} color={color.onRedMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.listWrap}>
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: contentPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ErrorBanner message={error} onRetry={history.reload} />

          {loading && !entries.length ? <Loading label="Leyendo tu historial…" /> : null}

          {!loading && !filtered.length ? (
            <EmptyState
              icon="history"
              title="Todavía no hay visualizaciones"
              description="Pregúntale algo al agente en la pestaña Chat y cada pantalla que construya se guardará aquí."
            />
          ) : null}

          {filtered.map((entry) => (
            <VisualizationCard key={entry.id} entry={entry} onOpen={onOpen} />
          ))}

          {source ? (
            <Text variant="tiny" style={styles.source}>
              {source === 'tiger' ? 'Historial en Tiger Data (TimescaleDB)' : 'Historial en memoria · sin DATABASE_URL'}
            </Text>
          ) : null}
        </ScrollView>

        {/* El contenido se desvanece al pasar bajo el buscador en vez de cortarse. */}
        <ScrollFade />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.red700,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 1,
    fontFamily: 'Manrope_700Bold',
    color: color.onRed,
    paddingVertical: 10,
  },

  listWrap: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },
  source: { textAlign: 'center', marginTop: space.sm },
});

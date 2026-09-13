// Pestaña Historial: cada interfaz que el agente ha construido, más reciente
// primero, con una miniatura de cómo se veía.
//
// La tarjeta es la misma que usa Colecciones (VisualizationCard), así que una
// visualización se ve igual sin importar por dónde se llegó a ella.

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState, ErrorBanner, Loading, ScrollFade, Text } from '../../components/ui';
import { SearchBar, useHideOnScroll } from '../../components/SearchBar';
import VisualizationCard from './VisualizationCard';
import { space } from '../../theme/tokens';

export default function HistoryTab({ history, onOpen, contentPadding }) {
  const [search, setSearch] = useState('');
  const { entries, loading, error, source } = history;
  // El buscador se recoge al bajar por la lista y vuelve al subir.
  const collapsible = useHideOnScroll();

  const filtered = search.trim()
    ? entries.filter((entry) => entry.title?.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;

  return (
    <View style={{ flex: 1 }}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        accessibilityLabel="Buscar en el historial"
        collapsible={collapsible}
      />

      <View style={styles.listWrap}>
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: contentPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={collapsible.onScroll}
          scrollEventThrottle={collapsible.scrollEventThrottle}
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
  listWrap: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },
  source: { textAlign: 'center', marginTop: space.sm },
});

// Pestaña Colecciones: las carpetas del historial.
//
// No son colecciones inventadas por el frontend — son las cinco del catálogo
// cerrado de `@norte/a2ui-schema` y la que se muestra en cada tarjeta es la que
// el propio agente eligió al generar la visualización.
//
// Tocar una NO lleva al historial: la colección se abre en su sitio y muestra
// abajo sus visualizaciones, con la misma tarjeta del historial. Perder el mapa
// de colecciones para ver lo que hay dentro de una era un viaje de ida y vuelta
// por nada.
//
// El cajón se abre y se cierra animando su propio alto, no con LayoutAnimation:
// LayoutAnimation sabe hacer aparecer cosas, pero al cerrar las desvanece en su
// sitio en vez de recogerlas. Animando el alto, las tarjetas de abajo se
// acomodan solas cuadro a cuadro y el cierre es el mismo gesto al revés.
//
// El grosor del mazo dice cuánto hay dentro antes de abrirlo: vacía, una sola
// tarjeta; de 1 a 3, una carta detrás; de 4 en adelante, tres.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState, ErrorBanner, Loading, ScrollFade, Text } from '../../components/ui';
import Icon from '../../components/Icon';
import VisualizationCard from './VisualizationCard';
import { color, radius, shadow, space } from '../../theme/tokens';

// Cada colección tiene su propio degradado dentro de la escala del rojo
// institucional: se distinguen de un vistazo sin salirse de la marca.
const GRADIENTS = {
  transacciones: ['#eb0029', '#9e0018'],
  promociones: ['#f0304f', '#c8001f'],
  movimientos: ['#d9002a', '#7a0012'],
  gastos: ['#eb0029', '#7a0012'],
  otros: ['#c8001f', '#6b0010'],
};

const ICONS = {
  transacciones: 'transfers',
  promociones: 'sparkle',
  movimientos: 'history',
  gastos: 'chartPie',
  otros: 'layers',
};

// Cuántas cartas asoman por detrás del mazo.
function deckDepth(total) {
  if (!total) return 0;
  return total >= 4 ? 3 : 1;
}

// Desplazamiento de cada carta de atrás, en píxeles por nivel.
const LAYER_STEP = 7;
const LAYER_INSET = 9;

// Lento a propósito: el cajón tiene que leerse como que las tarjetas bajan de
// detrás de la colección, y a 200 ms eso no se alcanza a ver.
const DRAWER_MS = 460;

function FolderCard({ folder, entries, expanded, onToggle, onOpenEntry }) {
  const colors = GRADIENTS[folder.id] ?? GRADIENTS.otros;
  const depth = deckDepth(folder.total);

  const open = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = useState(0);
  // El contenido del cajón solo existe mientras se ve: montar las
  // visualizaciones de las cinco colecciones a la vez sería dibujar treinta
  // gráficas para no enseñar ninguna.
  const [mounted, setMounted] = useState(expanded);

  useEffect(() => {
    if (expanded) setMounted(true);
    const animation = Animated.timing(open, {
      toValue: expanded ? 1 : 0,
      duration: DRAWER_MS,
      easing: Easing.inOut(Easing.cubic),
      // El alto no se puede animar en el hilo nativo, y girar el chevrón desde
      // el mismo valor obliga a que los dos vayan por JS: mezclar drivers sobre
      // un mismo Animated.Value truena en tiempo de ejecución.
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !expanded) setMounted(false);
    });
    return () => animation.stop();
  }, [expanded, open]);

  const rotate = open.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const drawerHeight = open.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] });
  // Las tarjetas entran empujadas desde arriba, como si salieran del mazo.
  const drawerShift = open.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });

  return (
    <View>
      {/* El relleno de abajo reserva el sitio de las cartas traseras para que no
          se le encimen a la siguiente colección. */}
      <View style={{ paddingBottom: depth * LAYER_STEP }}>
        {Array.from({ length: depth }, (_, index) => index + 1).map((level) => (
          <View
            key={level}
            pointerEvents="none"
            style={[
              styles.layer,
              {
                left: level * LAYER_INSET,
                right: level * LAYER_INSET,
                top: level * LAYER_STEP,
                bottom: (depth - level) * LAYER_STEP,
                backgroundColor: colors[1],
                opacity: 1 - level * 0.22,
              },
            ]}
          />
        ))}

        <Pressable
          onPress={() => onToggle(folder)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${folder.label}, ${folder.total} visualizaciones`}
          style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}
        >
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.cardBody}>
              <Icon name={ICONS[folder.id] ?? 'folder'} size={22} color="rgba(255,255,255,0.85)" />
              <Text variant="h2" style={styles.cardTitle} numberOfLines={1}>
                {folder.label.toUpperCase()}
              </Text>
              <Text variant="small" style={styles.cardCount}>
                {folder.total === 1 ? '1 visualización' : `${folder.total} visualizaciones`}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Icon name="chevron" size={22} color={color.onRed} />
            </Animated.View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* El alto lo manda la animación y el contenido se mide aparte, en
          absoluto, para que su alto natural no dependa de lo que ya se abrió. */}
      <Animated.View style={{ height: drawerHeight, opacity: open, overflow: 'hidden' }}>
        {mounted ? (
          <Animated.View
            onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
            style={[styles.drawer, { transform: [{ translateY: drawerShift }] }]}
          >
            {entries.length ? (
              entries.map((entry) => (
                <VisualizationCard key={entry.id} entry={entry} onOpen={onOpenEntry} showFolder={false} />
              ))
            ) : (
              <Text variant="small" style={styles.drawerEmpty}>
                Esta colección todavía está vacía.
              </Text>
            )}
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export default function FoldersTab({ history, onOpenEntry, contentPadding }) {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const { folders, entries, loading, error } = history;

  const term = search.trim().toLowerCase();
  const filtered = term ? folders.filter((folder) => folder.label.toLowerCase().includes(term)) : folders;

  const toggle = (folder) => {
    setOpenId((current) => (current === folder.id ? null : folder.id));
  };

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
            accessibilityLabel="Buscar colección"
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
          {loading && !folders.length ? <Loading label="Cargando colecciones…" /> : null}
          {!loading && !filtered.length ? (
            <EmptyState icon="folder" title="Sin colecciones" description="El agente las crea al archivar cada vista." />
          ) : null}
          {filtered.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              entries={entries.filter((entry) => entry.folder === folder.id)}
              expanded={openId === folder.id}
              onToggle={toggle}
              onOpenEntry={onOpenEntry}
            />
          ))}
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

  layer: { position: 'absolute', borderRadius: radius.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    padding: space.xl,
    minHeight: 104,
    ...shadow.md,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: color.onRed, letterSpacing: 0.5 },
  cardCount: { color: color.onRedMuted },

  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    gap: space.md,
    paddingTop: space.md,
    paddingHorizontal: space.sm,
  },
  drawerEmpty: { textAlign: 'center', paddingVertical: space.lg },
});

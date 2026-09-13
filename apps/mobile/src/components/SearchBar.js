// Buscador rojo de Historial y Colecciones, y el gesto que lo esconde.
//
// Las dos pestañas tenían el mismo buscador copiado; ahora es uno solo y además
// se recoge al desplazar la lista hacia abajo y vuelve al subir, para que la
// lista tenga toda la pantalla mientras se lee. Se anima el alto (no solo la
// posición) para que la lista suba a ocupar su lugar en vez de dejar un hueco.
//
// `useHideOnScroll` devuelve el `onScroll` que hay que darle a la lista y el
// estilo animado que envuelve al buscador. Un cambio de dirección de unos
// pocos píxeles no lo mueve: el pulgar tiembla, y el buscador no debe hacerlo.

import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Icon from './Icon';
import { color, radius, space } from '../theme/tokens';

const DIRECTION_THRESHOLD = 6;
const TOGGLE_MS = 200;

export function useHideOnScroll() {
  const shown = useRef(new Animated.Value(1)).current;
  const visibleRef = useRef(true);
  const lastY = useRef(0);
  const [height, setHeight] = useState(0);

  const animateTo = useCallback(
    (value) => {
      const visible = value === 1;
      if (visibleRef.current === visible) return;
      visibleRef.current = visible;
      Animated.timing(shown, {
        toValue: value,
        duration: TOGGLE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    },
    [shown],
  );

  const onScroll = useCallback(
    (event) => {
      const y = event.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;
      // Arriba del todo siempre se ve; el rebote de iOS (y < 0) cuenta como arriba.
      if (y <= 0) animateTo(1);
      else if (delta > DIRECTION_THRESHOLD && y > height) animateTo(0);
      else if (delta < -DIRECTION_THRESHOLD) animateTo(1);
      lastY.current = y;
    },
    [animateTo, height],
  );

  const onLayout = useCallback(
    (event) => {
      const measured = event.nativeEvent.layout.height;
      if (measured > 0 && measured !== height) setHeight(measured);
    },
    [height],
  );

  // Hasta medir, el alto queda libre: si arrancara en 0 el buscador no se vería
  // en el primer render y nunca podría medirse.
  const style = height
    ? { height: shown.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), opacity: shown, overflow: 'hidden' }
    : null;

  return { onScroll, onLayout, style, scrollEventThrottle: 16 };
}

export function SearchBar({ value, onChangeText, placeholder = 'BUSCAR...', accessibilityLabel, collapsible }) {
  return (
    <Animated.View style={collapsible?.style}>
      <View style={styles.wrap} onLayout={collapsible?.onLayout}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={color.onRedMuted} />
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.onRedMuted}
            autoCapitalize="none"
            accessibilityLabel={accessibilityLabel}
          />
          {value ? (
            <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
              <Icon name="close" size={17} color={color.onRedMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.red700,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    minHeight: 46,
  },
  input: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 1,
    fontFamily: 'Manrope_700Bold',
    color: color.onRed,
    paddingVertical: 10,
  },
});

export default SearchBar;

// Barra inferior roja con Chat elevado al centro.
//
// Es la `tabBar` de @react-navigation/bottom-tabs, pero dibujada por nosotros:
// la pestaña del medio no es una pestaña más, es el botón del asistente y tiene
// que leerse como el centro de la app (que es justo lo que propone el reto).
// Por eso el disco no se mueve: no marca dónde estás —eso lo dicen la etiqueta
// y el trazo del icono—, marca dónde está el asistente, y un ancla que cambia
// de sitio deja de ser ancla.
//
// El disco sobresale por encima de la barra, y ahí está el detalle: en Android
// lo que se dibuja fuera de los límites de su contenedor **no recibe toques**.
// Por eso el disco no se despega con un margen negativo — vive dentro del
// espacio que le reserva el contenedor de la barra, en posición absoluta. Si se
// resolviera con `marginTop: -24`, la mitad de arriba del botón más importante
// de la app sería decorativa.

import { Image, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { color, space } from '../theme/tokens';
import Icon from './Icon';

const ICONS = {
  Cuentas: 'accounts',
  Transferencias: 'transfers',
  Chat: 'chat',
  Inversiones: 'investments',
  Servicios: 'services',
};

const CENTER_TAB = 'Chat';
const DISC_SIZE = 54;
// Cuánto del disco queda por encima del borde de la barra.
const DISC_LIFT = 22;

export default function BottomNav({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  const centerIndex = state.routes.findIndex((route) => route.name === CENTER_TAB);
  const centerRoute = state.routes[centerIndex];
  const centerFocused = state.index === centerIndex;

  const press = (route, focused) => () => {
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? route.name;

          // El hueco del centro: el disco se dibuja aparte, encima.
          if (route.name === CENTER_TAB) {
            return (
              <View key={route.key} style={styles.item} pointerEvents="none">
                <View style={{ height: DISC_SIZE - DISC_LIFT }} />
                <RNText style={[styles.label, focused && styles.labelActive]}>{label}</RNText>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={press(route, focused)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            >
              <Icon
                name={ICONS[route.name] ?? 'layers'}
                size={22}
                color={color.onRed}
                strokeWidth={focused ? 2.1 : 1.6}
              />
              <RNText style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {label}
              </RNText>
            </Pressable>
          );
        })}
      </View>

      {centerRoute ? (
        <Pressable
          onPress={press(centerRoute, centerFocused)}
          accessibilityRole="tab"
          accessibilityState={{ selected: centerFocused }}
          accessibilityLabel="Asistente Norte AI"
          hitSlop={6}
          style={({ pressed }) => [styles.disc, pressed && { opacity: 0.88 }]}
        >
          <Image source={require('../../assets/brand/Banorte_White.png')} style={styles.discLogo} resizeMode="contain" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserva el espacio del disco por encima de la barra y se deja transparente
  // para que el disco se vea flotando sobre el contenido. Todo lo tocable vive
  // dentro de este contenedor, así que Android sí registra los toques.
  container: { paddingTop: DISC_LIFT, backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: color.red,
  },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 2 },
  label: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: color.onRedMuted,
    letterSpacing: 0.1,
  },
  labelActive: { color: color.onRed, fontFamily: 'Manrope_800ExtraBold' },

  disc: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: color.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discLogo: { width: 30, height: 22 },
});

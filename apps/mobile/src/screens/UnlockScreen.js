// Desbloqueo biométrico.
//
// La segunda vez que abres la app no vuelves a escribir la contraseña: hay un
// token en el llavero del dispositivo y la huella o el rostro es lo que lo
// libera. El sistema pide la biometría solo; si la persona la cancela, sigue
// teniendo la salida de siempre — entrar con contraseña.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ErrorBanner, Text } from '../components/ui';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { biometryLabel } from '../auth/biometrics';
import { color, space } from '../theme/tokens';

export default function UnlockScreen() {
  const insets = useSafeAreaInsets();
  const { user, device, unlock, signOut, error } = useAuth();
  const [busy, setBusy] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  const biometry = biometryLabel(device.kind);
  const name = user?.preferredName ?? '';

  // El sistema se pide solo al abrir: la persona levanta el teléfono y ya está
  // dentro, sin tocar nada.
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      await unlock();
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [unlock]);

  // Halo que respira alrededor del ícono mientras espera la biometría.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  async function retry() {
    setBusy(true);
    await unlock();
    setBusy(false);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}>
      <StatusBar style="light" />

      <View style={styles.top}>
        <Image source={require('../../assets/brand/Banorte_White.png')} style={styles.logo} resizeMode="contain" />
        <Text variant="h1" style={styles.hello}>
          Hola de nuevo{name ? `, ${name}` : ''}
        </Text>
        <Text variant="small" style={styles.subtitle}>
          Usa tu {biometry.name} para volver a entrar.
        </Text>
      </View>

      <Pressable
        onPress={retry}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={biometry.action}
        style={styles.orbWrap}
      >
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            },
          ]}
        />
        <View style={styles.orb}>
          <Icon name={biometry.icon} size={52} color={color.onRed} strokeWidth={1.5} />
        </View>
      </Pressable>

      <View style={styles.bottom}>
        <ErrorBanner message={error} />
        <Button
          title={biometry.action}
          onPress={retry}
          loading={busy}
          style={styles.cta}
          textStyle={{ color: color.red }}
        />
        <Button title="Entrar con contraseña" onPress={signOut} variant="ghost" textStyle={{ color: color.onRedMuted }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.red, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: 6 },
  logo: { width: 84, height: 48, marginBottom: space.md },
  hello: { color: color.onRed, textAlign: 'center' },
  subtitle: { color: color.onRedMuted, textAlign: 'center' },

  orbWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: '#ffffff' },
  orb: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottom: { gap: space.md },
  cta: { backgroundColor: color.surface },
});

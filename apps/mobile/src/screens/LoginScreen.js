// Ingreso con usuario y contraseña.
//
// Es la pantalla que van a rediseñar: toda la lógica vive en `useAuth`, así que
// cambiar esta piel no toca el flujo. Lo único que esta vista sabe hacer es
// recoger dos campos, pedir el login y ofrecer activar la biometría después.
//
// El acceso a la configuración de conexión está aquí a propósito: si el día de
// la demo la API cambia de URL, se arregla sin recompilar y sin salir del login.

import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ErrorBanner, Field, Text } from '../components/ui';
import Icon from '../components/Icon';
import ConnectionSheet from '../components/ConnectionSheet';
import { useAuth } from '../auth/AuthProvider';
import { biometryLabel } from '../auth/biometrics';
import { color, radius, space } from '../theme/tokens';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, error, setError, device, enableBiometrics } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const passwordRef = useRef(null);

  const biometry = biometryLabel(device.kind);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const result = await signIn(username.trim(), password);
    setBusy(false);
    if (!result.ok) return;
    // Recién entrados se ofrece el acceso rápido: la siguiente vez basta el
    // dedo o la cara. Si dice que no, la app funciona igual.
    if (device.available) await enableBiometrics();
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image source={require('../../assets/brand/Banorte_White.png')} style={styles.logo} resizeMode="contain" />
            <Text variant="h1" style={styles.title}>
              Banca Digital
            </Text>
            <Text variant="small" style={styles.subtitle}>
              Entra para hablar con Norte AI, tu asistente que arma la pantalla que necesitas.
            </Text>
          </View>

          <View style={styles.card}>
            <ErrorBanner message={error} />

            <Field
              label="Usuario"
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                if (error) setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              placeholder="regina"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Field
              ref={passwordRef}
              label="Contraseña"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={submit}
              right={
                <Pressable
                  onPress={() => setReveal((value) => !value)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <Icon name={reveal ? 'eyeOff' : 'eye'} size={20} color={color.muted} />
                </Pressable>
              }
            />

            <Button
              title="Entrar"
              onPress={submit}
              loading={busy}
              disabled={!username.trim() || !password}
              style={{ marginTop: space.sm }}
            />

            {device.available ? (
              <View style={styles.biometryNote}>
                <Icon name={biometry.icon} size={17} color={color.muted} />
                <Text variant="small" style={{ flex: 1 }}>
                  Al entrar podrás activar el acceso con {biometry.name} para la próxima vez.
                </Text>
              </View>
            ) : null}
          </View>

          {/* Credenciales sintéticas: no hay datos reales en este proyecto y el
              jurado necesita poder entrar sin preguntarnos. */}
          <View style={styles.demoBox}>
            <Icon name="shield" size={16} color={color.onRedMuted} />
            <Text variant="small" style={styles.demoText}>
              Demo: <Text style={styles.demoStrong}>regina</Text> · <Text style={styles.demoStrong}>Banorte2026</Text>
              {'\n'}Datos sintéticos, ningún cliente real.
            </Text>
          </View>

          <Pressable
            onPress={() => setShowConnection(true)}
            hitSlop={10}
            style={styles.connectionLink}
            accessibilityRole="button"
          >
            <Icon name="services" size={15} color={color.onRedMuted} />
            <Text variant="small" style={styles.connectionText}>
              Configurar conexión
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConnectionSheet visible={showConnection} onClose={() => setShowConnection(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.red },
  content: { paddingHorizontal: space.xl, gap: space.xl, minHeight: '100%' },

  brand: { alignItems: 'center', gap: space.sm },
  logo: { width: 92, height: 54 },
  title: { color: color.onRed, marginTop: space.sm },
  subtitle: { color: color.onRedMuted, textAlign: 'center', maxWidth: 300 },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.lg,
  },
  biometryNote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },

  demoBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderRadius: radius.md,
    padding: space.md,
  },
  demoText: { flex: 1, color: color.onRedMuted, lineHeight: 18 },
  demoStrong: { color: color.onRed, fontFamily: 'Manrope_700Bold' },

  connectionLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'auto' },
  connectionText: { color: color.onRedMuted, textDecorationLine: 'underline' },
});

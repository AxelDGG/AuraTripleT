// Franja roja superior: logotipo, saludo con el nombre de la sesión, último
// ingreso y acceso al perfil. Es lo primero que ve la persona y lo que le dice
// que sigue dentro de su banco, así que el saludo sale de la sesión real
// (/api/auth/login) y no de un texto fijo.

import { Image, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, space } from '../theme/tokens';
import { fmtLoginStamp } from '../lib/format';
import Icon from './Icon';

const CHANNEL_LABEL = { mobile: 'Vía Móvil', web: 'Vía Web', widget: 'Vía Widget' };

export default function TopBar({ user, onPressProfile }) {
  const insets = useSafeAreaInsets();
  const name = user?.preferredName ?? user?.fullName ?? '';
  const stamp = fmtLoginStamp(user?.lastLogin?.at);
  const channel = CHANNEL_LABEL[user?.lastLogin?.channel] ?? '';

  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
      <Image source={require('../../assets/brand/Banorte_White.png')} style={styles.logo} resizeMode="contain" />

      <View style={styles.center}>
        <RNText style={styles.greeting} numberOfLines={1}>
          Hola <RNText style={styles.greetingName}>{name}</RNText>
        </RNText>
        {stamp ? (
          <RNText style={styles.stamp} numberOfLines={2}>
            Último ingreso:{'\n'}
            {stamp} {channel}
          </RNText>
        ) : (
          <RNText style={styles.stamp}>Primer ingreso desde este dispositivo</RNText>
        )}
      </View>

      <Pressable
        onPress={onPressProfile}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Perfil y sesión"
        style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
      >
        <Icon name="user" size={24} color={color.onRed} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.red,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  logo: { width: 44, height: 26 },
  center: { flex: 1, alignItems: 'center' },
  greeting: { fontSize: 17, fontFamily: 'Manrope_500Medium', color: color.onRed },
  greetingName: { fontFamily: 'Manrope_800ExtraBold' },
  stamp: {
    fontSize: 10.5,
    lineHeight: 13.5,
    fontFamily: 'Manrope_400Regular',
    color: color.onRedMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.6,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

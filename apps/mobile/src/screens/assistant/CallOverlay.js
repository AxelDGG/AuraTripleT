// Pantalla de llamada con el agente.
//
// Se monta encima del chat mientras dura la llamada. El orbe con la marca late
// distinto según quién habla: anillos cuando escucha, pulso cuando el agente
// habla, quieto mientras piensa.
//
// En el modo local se muestra debajo lo último que dijo cada quien, porque ahí
// la transcripción tarda y conviene ver que sí entendió. Con ElevenLabs la
// conversación es fluida y ese texto solo estorba: no se muestra.
//
// Salir es obligatorio y obvio: botón rojo "Colgar" abajo, una X arriba a la
// derecha, y el botón físico de atrás también cuelga.

import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import Icon from '../../components/Icon';
import { CALL } from '../../voice/useCall';
import { color, radius, space } from '../../theme/tokens';

const LABELS = {
  [CALL.CONNECTING]: 'Conectando…',
  [CALL.LISTENING]: 'Te escucho…',
  [CALL.THINKING]: 'Pensando…',
  [CALL.SPEAKING]: 'Hablando…',
};

const ORB = 132;

function Ring({ delay, active }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, delay, progress]);

  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }],
        },
      ]}
    />
  );
}

export default function CallOverlay({ call }) {
  const insets = useSafeAreaInsets();
  const { state, transcript } = call;
  // Con ElevenLabs la que habla es Maya, la misma agente de la web.
  const agentName = call.provider === 'elevenlabs' ? 'Maya' : 'Norte AI';
  const showTranscript = call.provider !== 'elevenlabs';
  const pulse = useRef(new Animated.Value(0)).current;

  // Atrás en Android = colgar, en vez de salir de la pantalla con la llamada viva.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      call.hangUp('hangup');
      return true;
    });
    return () => sub.remove();
  }, [call]);

  useEffect(() => {
    if (state !== CALL.SPEAKING) {
      pulse.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [state, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      <Pressable
        onPress={() => call.hangUp('hangup')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Salir de la llamada"
        style={({ pressed }) => [styles.close, { top: insets.top + space.md }, pressed && { opacity: 0.7 }]}
      >
        <Icon name="close" size={22} color={color.onRed} strokeWidth={2} />
      </Pressable>

      <View style={styles.head}>
        <Text variant="tiny" style={styles.kicker}>
          LLAMADA CON EL ASISTENTE
        </Text>
        <Text variant="h1" style={styles.title}>
          {agentName}
        </Text>
      </View>

      <View style={styles.orbWrap}>
        <Ring delay={0} active={state === CALL.LISTENING || state === CALL.CONNECTING} />
        <Ring delay={800} active={state === CALL.LISTENING} />
        <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
          <Image source={require('../../../assets/brand/Banorte_Mark_White.png')} style={styles.mark} resizeMode="contain" />
        </Animated.View>
        <View style={styles.statusRow}>
          {state === CALL.THINKING ? <View style={styles.dot} /> : null}
          <Text variant="bodyStrong" style={styles.status}>
            {LABELS[state] ?? ''}
          </Text>
        </View>
      </View>

      <View style={styles.transcript}>
        {showTranscript && transcript.user ? (
          <View style={[styles.bubble, styles.bubbleUser]}>
            <Text variant="small" style={styles.bubbleWho}>
              Tú
            </Text>
            <Text variant="body" style={styles.bubbleText} numberOfLines={3}>
              {transcript.user}
            </Text>
          </View>
        ) : null}
        {showTranscript && transcript.agent ? (
          <View style={[styles.bubble, styles.bubbleAgent]}>
            <Text variant="small" style={styles.bubbleWho}>
              {agentName}
            </Text>
            <Text variant="body" style={styles.bubbleText} numberOfLines={4}>
              {transcript.agent}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => call.hangUp('hangup')}
        accessibilityRole="button"
        accessibilityLabel="Colgar"
        style={({ pressed }) => [styles.hangUp, pressed && { opacity: 0.85 }]}
      >
        <Icon name="callEnd" size={26} color={color.onRed} strokeWidth={2} />
        <Text variant="bodyStrong" style={styles.hangUpText}>
          Colgar
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.red,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    zIndex: 20,
  },
  head: { alignItems: 'center', gap: 4 },
  kicker: { color: color.onRedMuted, letterSpacing: 1.2 },
  title: { color: color.onRed },

  orbWrap: { alignItems: 'center', justifyContent: 'center', gap: space.lg },
  ring: {
    position: 'absolute',
    top: 0,
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: color.red700,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  mark: { width: 72, height: 46 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.onRed, opacity: 0.8 },
  status: { color: color.onRed, fontSize: 16 },

  transcript: { width: '100%', gap: space.sm, minHeight: 120, justifyContent: 'flex-end' },
  bubble: { borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2, maxWidth: '92%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.16)' },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: color.surface },
  bubbleWho: { color: color.muted, fontFamily: 'Manrope_700Bold', letterSpacing: 0.4 },
  bubbleText: { color: color.ink },

  close: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  hangUp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    width: '100%',
    minHeight: 60,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  hangUpText: { color: color.onRed, fontSize: 16 },
});

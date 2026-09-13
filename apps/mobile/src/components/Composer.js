// Barra de escritura + micrófono.
//
// Es el único punto de entrada al agente en la app, así que tiene que dejar
// claro en todo momento en qué estado está: escribiendo, grabando (el botón
// late en rojo), transcribiendo, o esperando la respuesta.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { color, radius, shadow, space } from '../theme/tokens';
import Icon from './Icon';
import { Text } from './ui';

export default function Composer({
  value,
  onChangeText,
  onSubmit,
  onMicPress,
  recording,
  transcribing,
  busy,
  autoFocus,
  placeholder = 'Escribe o habla con el agente Banorte…',
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);

  useEffect(() => {
    if (!recording) {
      pulse.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    animation.start();
    return () => animation.stop();
  }, [recording, pulse]);

  useEffect(() => {
    if (autoFocus) {
      // El teclado se pide en el siguiente tick: si se pide durante la
      // transición de navegación, Android lo ignora.
      const timer = setTimeout(() => inputRef.current?.focus(), 320);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoFocus]);

  const canSend = Boolean(value.trim()) && !busy;

  return (
    <View style={styles.wrap}>
      {recording || transcribing ? (
        <View style={styles.hint}>
          <View style={[styles.hintDot, transcribing && { backgroundColor: color.amber }]} />
          <Text variant="small" style={styles.hintText}>
            {transcribing ? 'Transcribiendo lo que dijiste…' : 'Te escucho. Toca de nuevo para enviar.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.field}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.muted2}
            editable={!busy && !recording}
            maxLength={4000}
            returnKeyType="send"
            onSubmitEditing={() => canSend && onSubmit()}
            accessibilityLabel="Mensaje para el agente"
          />
          {canSend ? (
            <Pressable onPress={onSubmit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Enviar">
              <Icon name="send" size={19} color={color.red} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onMicPress}
          disabled={busy || transcribing}
          accessibilityRole="button"
          accessibilityState={{ busy: Boolean(recording) }}
          accessibilityLabel={recording ? 'Detener y enviar' : 'Dictar por voz'}
          style={({ pressed }) => [styles.mic, (busy || transcribing) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
        >
          {recording ? (
            <Animated.View
              style={[
                styles.micRing,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
                },
              ]}
            />
          ) : null}
          <Icon name={recording ? 'close' : 'mic'} size={21} color={color.onRed} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: space.sm },
  hintDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.red },
  hintText: { color: color.ink2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    ...shadow.sm,
  },
  input: { flex: 1, fontSize: 14.5, fontFamily: 'Manrope_500Medium', color: color.ink, paddingVertical: 12 },

  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.red,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.red,
  },
  micRing: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: color.red },
});

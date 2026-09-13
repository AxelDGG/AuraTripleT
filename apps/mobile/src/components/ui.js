// Primitivas de interfaz de la app. Son nuestras: no hay librería de UI de por
// medio, igual que en la web. Todo lo que se repite en más de una pantalla
// (tarjeta, botón, campo, chip, estado vacío) vive aquí.

import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, shadow, space, text as textStyles } from '../theme/tokens';
import Icon from './Icon';

// ---------- Texto ----------

export function Text({ variant = 'body', style, children, ...rest }) {
  return (
    <RNText style={[textStyles[variant] ?? textStyles.body, style]} {...rest}>
      {children}
    </RNText>
  );
}

// ---------- Tarjeta ----------

export function Card({ style, children, padded = true, ...rest }) {
  return (
    <View style={[styles.card, padded && styles.cardPadded, style]} {...rest}>
      {children}
    </View>
  );
}

// ---------- Botón ----------
//
// Tres tonos: `primary` (rojo, la acción del banco), `outline` y `ghost`. El
// estado presionado se hace con opacidad porque en Android el ripple se pierde
// sobre fondos rojos.

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, textStyle }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'outline' && styles.buttonOutline,
        variant === 'ghost' && styles.buttonGhost,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.onRed : color.red} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={variant === 'primary' ? color.onRed : color.red} /> : null}
          <RNText
            style={[
              styles.buttonText,
              variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextAccent,
              textStyle,
            ]}
          >
            {title}
          </RNText>
        </>
      )}
    </Pressable>
  );
}

// ---------- Campo de texto ----------

export const Field = forwardRef(function Field({ label, hint, error, right, style, ...inputProps }, ref) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {label ? (
        <Text variant="smallStrong" style={styles.fieldLabel}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.fieldBox, error && styles.fieldBoxError]}>
        <TextInput ref={ref} placeholderTextColor={color.muted2} style={styles.fieldInput} {...inputProps} />
        {right}
      </View>
      {error ? (
        <Text variant="small" style={styles.fieldError}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" style={styles.fieldHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

// ---------- Chip ----------

export function Chip({ label, tone = 'neutral', style }) {
  return (
    <View style={[styles.chip, tone === 'red' && styles.chipRed, tone === 'green' && styles.chipGreen, style]}>
      <RNText
        style={[
          styles.chipText,
          tone === 'red' && { color: color.red600 },
          tone === 'green' && { color: color.green },
        ]}
      >
        {label}
      </RNText>
    </View>
  );
}

// ---------- Estados ----------

export function Loading({ label = 'Cargando…', style }) {
  return (
    <View style={[styles.centered, style]}>
      <ActivityIndicator color={color.red} />
      <Text variant="small" style={{ marginTop: space.md }}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({ icon = 'sparkle', title, description, action, style }) {
  return (
    <View style={[styles.centered, style]}>
      <View style={styles.emptyOrb}>
        <Icon name={icon} size={26} color={color.red} />
      </View>
      <Text variant="h3" style={{ marginTop: space.lg, textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text variant="small" style={{ marginTop: space.sm, textAlign: 'center', maxWidth: 300 }}>
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorBanner({ message, onRetry, style }) {
  if (!message) return null;
  return (
    <View style={[styles.errorBanner, style]}>
      <Icon name="alert" size={18} color={color.red600} />
      <Text variant="small" style={styles.errorText}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reintentar">
          <Icon name="refresh" size={18} color={color.red600} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

// ---------- Pestañas segmentadas (Chat · Historial · Colecciones) ----------
//
// El selector no salta de una pestaña a otra: se desliza. La píldora clara es
// una sola vista absoluta que viaja por el riel, así que el movimiento va en la
// dirección del toque (izquierda o derecha) sin que haya que calcularla.
//
// El ancho de cada ranura se mide en tiempo de ejecución — no se puede asumir
// porque depende del ancho de la pantalla — y hasta que `onLayout` responde la
// píldora no se dibuja: aparecer en 0 y correr al lugar correcto se vería como
// un parpadeo en el primer render.

const SEGMENT_PAD = 4;

export function SegmentedTabs({ items, value, onChange, style }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    items.findIndex((item) => item.id === value),
    0,
  );
  const slide = useRef(new Animated.Value(index)).current;
  const slotWidth = items.length ? Math.max(width - SEGMENT_PAD * 2, 0) / items.length : 0;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      speed: 16,
      bounciness: 5,
    }).start();
  }, [index, slide]);

  return (
    <View
      style={[styles.segment, style]}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {slotWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentThumb,
            { width: slotWidth, transform: [{ translateX: Animated.multiply(slide, slotWidth) }] },
          ]}
        />
      ) : null}

      {items.map((item) => {
        const active = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={styles.segmentItem}
          >
            <RNText style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {item.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Difuminado de borde ----------
//
// Una lista que arranca justo debajo de una barra fija se corta en seco: la
// tarjeta se ve rebanada. Este degradado del color de fondo a transparente se
// monta encima del inicio del scroll para que el contenido se desvanezca en vez
// de terminar en una línea recta.

export function ScrollFade({ height = 24, position = 'top', style }) {
  const colors =
    position === 'top' ? [color.surface2, FADE_TRANSPARENT] : [FADE_TRANSPARENT, color.surface2];
  return (
    <LinearGradient
      colors={colors}
      pointerEvents="none"
      style={[styles.scrollFade, position === 'top' ? { top: 0 } : { bottom: 0 }, { height }, style]}
    />
  );
}

// El mismo #f4f4f7 con alfa 0: en Android un degradado hacia 'transparent'
// (negro alfa 0) se ve gris a media transición.
const FADE_TRANSPARENT = 'rgba(244,244,247,0)';

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    ...shadow.sm,
  },
  cardPadded: { padding: space.lg },

  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  buttonPrimary: { backgroundColor: color.red, ...shadow.red },
  buttonOutline: { borderWidth: 1.5, borderColor: color.red, backgroundColor: 'transparent' },
  buttonGhost: { backgroundColor: 'transparent', minHeight: 40 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonText: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  buttonTextPrimary: { color: color.onRed },
  buttonTextAccent: { color: color.red },

  fieldWrap: { gap: 6 },
  fieldLabel: { textTransform: 'uppercase', letterSpacing: 0.6 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
  },
  fieldBoxError: { borderColor: color.red },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: 'Manrope_500Medium', color: color.ink, paddingVertical: 12 },
  fieldError: { color: color.red600 },
  fieldHint: { color: color.muted },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surface3,
    alignSelf: 'flex-start',
  },
  chipRed: { backgroundColor: color.redTint },
  chipGreen: { backgroundColor: 'rgba(15, 143, 77, 0.12)' },
  chipText: { fontSize: 11, fontFamily: 'Manrope_700Bold', color: color.ink2, letterSpacing: 0.3 },

  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyOrb: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: color.redTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.redTint,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: 1,
    borderColor: color.redTint2,
  },
  errorText: { flex: 1, color: color.red700 },

  divider: { height: 1, backgroundColor: color.line },

  segment: {
    flexDirection: 'row',
    backgroundColor: color.red700,
    borderRadius: radius.pill,
    padding: SEGMENT_PAD,
    overflow: 'hidden',
  },
  segmentThumb: {
    position: 'absolute',
    top: SEGMENT_PAD,
    bottom: SEGMENT_PAD,
    left: SEGMENT_PAD,
    borderRadius: radius.pill,
    backgroundColor: color.red,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollFade: { position: 'absolute', left: 0, right: 0, zIndex: 4 },
  segmentText: { fontSize: 13.5, fontFamily: 'Manrope_600SemiBold', color: 'rgba(255,255,255,0.72)' },
  segmentTextActive: { color: color.onRed, fontFamily: 'Manrope_700Bold' },
});

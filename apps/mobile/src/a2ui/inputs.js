// Controles y acciones de Norte A2UI en nativo.
//
// Cada control está ligado a una ruta del dataModel (`value: {path}`): al
// tocarlo escribe ahí y el runtime avisa; todo lo que dependa de esa ruta se
// recalcula en el teléfono, sin llamar al agente. Es la misma regla que en la
// web (js/a2ui-web.js), con los mismos nombres y las mismas props.

import { useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button as UiButton, Card, Text } from '../components/ui';
import Icon from '../components/Icon';
import { color, radius, space } from '../theme/tokens';
import { formatCurrency } from './core/format';

const asText = (v) => (v === undefined || v === null ? '' : String(v));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function normalizeOptions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => (isObject(o) ? { value: o.value, label: asText(o.label ?? o.value) } : { value: o, label: asText(o) }));
}

function Label({ children }) {
  if (!children) return null;
  return (
    <Text variant="tiny" style={styles.label}>
      {String(children).toUpperCase()}
    </Text>
  );
}

// ---------- Slider ----------
//
// Sin librería: una pista con PanResponder. El valor se ajusta al `step` y se
// escribe en el modelo en cada movimiento, que es lo que hace que los Kpi y la
// gráfica de amortización se muevan con el dedo.

export function Slider({ props, ctx }) {
  const min = Number.isFinite(Number(props.min)) ? Number(props.min) : 0;
  const max = Number.isFinite(Number(props.max)) ? Number(props.max) : 100;
  const step = Number(props.step) > 0 ? Number(props.step) : 1;
  const current = Number(props.value);
  const value = Number.isFinite(current) ? Math.min(max, Math.max(min, current)) : min;
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const valueAt = (x) => {
    if (!widthRef.current) return value;
    const ratio = Math.min(1, Math.max(0, x / widthRef.current));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => ctx.setData(valueAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => ctx.setData(valueAt(e.nativeEvent.locationX)),
    }),
  ).current;

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const shown = `${props.format === 'currency' ? formatCurrency(value) : value}${props.unit ? ` ${props.unit}` : ''}`;

  return (
    <Card style={styles.sliderCard}>
      <View style={styles.sliderHead}>
        <Label>{props.label}</Label>
        <Text variant="h3" style={{ color: color.red }}>
          {shown}
        </Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={asText(props.label)}
        accessibilityValue={{ min, max, now: value, text: shown }}
      >
        <View style={[styles.fill, { width: width * ratio }]} />
        <View style={[styles.thumb, { left: Math.max(0, width * ratio - 13) }]} />
      </View>
      <View style={styles.scale}>
        <Text variant="tiny">{`${min}${props.unit ? ` ${props.unit}` : ''}`}</Text>
        <Text variant="tiny">{`${max}${props.unit ? ` ${props.unit}` : ''}`}</Text>
      </View>
    </Card>
  );
}

// ---------- ChoiceChips ----------

export function ChoiceChips({ props, ctx }) {
  const options = normalizeOptions(props.options);
  return (
    <View style={{ gap: 6 }}>
      <Label>{props.label}</Label>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value == props.value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => ctx.setData(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
            >
              <Text variant="smallStrong" style={{ color: active ? color.onRed : color.ink2 }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Select ----------
//
// Modal con la lista: RN no trae <select> y no vamos a meter una librería por
// un desplegable.

export function Select({ props, ctx }) {
  const [open, setOpen] = useState(false);
  const options = normalizeOptions(props.options);
  const selected = options.find((o) => o.value == props.value);

  return (
    <View style={{ gap: 5 }}>
      <Label>{props.label}</Label>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${asText(props.label)}. Seleccionado: ${selected?.label ?? 'ninguno'}`}
        style={({ pressed }) => [styles.control, styles.selectControl, pressed && { opacity: 0.75 }]}
      >
        <Text variant="body" numberOfLines={1} style={{ flex: 1, color: selected ? color.ink : color.muted2 }}>
          {selected?.label ?? 'Selecciona…'}
        </Text>
        <Icon name="chevron" size={18} color={color.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text variant="h3" style={{ marginBottom: space.sm }}>
              {asText(props.label)}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((option) => {
                const active = option.value == props.value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => {
                      ctx.setData(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, (active || pressed) && styles.optionActive]}
                  >
                    <Text variant={active ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
                      {option.label}
                    </Text>
                    {active ? <Icon name="check" size={17} color={color.red} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------- TextField ----------

export function TextField({ props, ctx }) {
  const numeric = props.inputType === 'number';
  return (
    <View style={{ gap: 5 }}>
      <Label>{props.label}</Label>
      <TextInput
        style={styles.control}
        value={asText(props.value)}
        onChangeText={(text) => ctx.setData(numeric ? (text === '' ? '' : Number(text.replace(',', '.'))) : text)}
        placeholder={props.placeholder ? asText(props.placeholder) : undefined}
        placeholderTextColor={color.muted2}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        editable={!ctx.disabled}
        accessibilityLabel={asText(props.label)}
      />
    </View>
  );
}

// ---------- Toggle ----------

export function Toggle({ props, ctx }) {
  const on = props.value === true || props.value === 'true';
  return (
    <View style={styles.toggle}>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {asText(props.label)}
      </Text>
      <Switch value={on} onValueChange={(next) => ctx.setData(next)} trackColor={{ true: color.red, false: color.surface3 }} thumbColor="#fff" />
    </View>
  );
}

// ---------- Button ----------
//
// `confirm: true` pide un segundo toque: la primera vez el botón cambia a
// "¿Confirmar?" y solo el segundo manda el evento.

export function Button({ props, ctx }) {
  const [armed, setArmed] = useState(false);
  const [sent, setSent] = useState(false);
  const variant = props.variant === 'secondary' ? 'outline' : props.variant === 'ghost' ? 'ghost' : 'primary';
  const label = asText(props.label ?? 'Continuar');
  const press = () => {
    if (sent || ctx.disabled) return;
    if (props.confirm && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 6000);
      return;
    }
    const result = ctx.dispatch(ctx.raw.action);
    if (result?.kind === 'event') setSent(true);
  };
  return (
    <UiButton
      title={sent ? `${label} ✓` : armed ? `¿Confirmar? ${label}` : label}
      variant={variant}
      onPress={press}
      disabled={sent || ctx.disabled}
    />
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 0.7, color: color.muted },
  sliderCard: { gap: space.sm },
  sliderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  track: { height: 36, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, height: 8, borderRadius: 4, backgroundColor: color.redTint2 },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.red,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: color.red,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
  },
  chipActive: { backgroundColor: color.red, borderColor: color.red },

  control: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: color.ink,
  },
  selectControl: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,28,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxl,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  optionActive: { backgroundColor: color.redTint },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
});

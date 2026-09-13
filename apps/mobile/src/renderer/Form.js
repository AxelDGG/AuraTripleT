// El componente accionable de Norte UI Spec.
//
// Es la pieza que cierra el ciclo del reto: el agente propone un formulario, la
// persona lo envía y ese envío vuelve al agente como un mensaje
// "[form:<accion>] campo=valor, campo=valor" — exactamente el mismo formato que
// manda la web, porque del otro lado hay un solo backend.
//
// La regla de seguridad vive en el servidor: `transfer_funds` solo se ejecuta
// si el mensaje empieza con "[form:transfer_funds]". Aquí no se decide nada
// sobre el dinero, solo se recogen los valores.

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, Text } from '../components/ui';
import Icon from '../components/Icon';
import { color, radius, space } from '../theme/tokens';

// Tolerante a las variantes del modelo: `fields` o `inputs`, `inputType` o
// `type`, opciones como objeto o como string suelto.
function normalizeFields(component) {
  const raw = component.fields ?? component.inputs ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((field) => field && typeof field === 'object')
    .map((field) => {
      const options = Array.isArray(field.options)
        ? field.options.map((option) =>
            option && typeof option === 'object'
              ? { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? '') }
              : { value: String(option), label: String(option) },
          )
        : [];
      const kind = field.inputType ?? field.type ?? (options.length ? 'select' : 'text');
      return {
        name: String(field.name ?? ''),
        label: String(field.label ?? field.name ?? ''),
        kind: ['text', 'number', 'select'].includes(kind) ? kind : 'text',
        placeholder: field.placeholder ? String(field.placeholder) : undefined,
        initial: field.value === undefined || field.value === null ? '' : String(field.value),
        options,
      };
    })
    .filter((field) => field.name);
}

// Selector propio: un modal con la lista. RN no trae <select> y no vamos a
// meter una librería de UI por un desplegable.
function Select({ field, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = field.options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${field.label}. Seleccionado: ${selected?.label ?? 'ninguno'}`}
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
              {field.label}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {field.options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
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
    </>
  );
}

// `onSubmit` recibe el mensaje v1 "[form:accion] campo=valor"; `onSubmitEvent`
// (Norte A2UI) recibe el evento tipado {name, context} con los números ya
// convertidos. Si vienen los dos, gana el tipado.
export default function Form({ component, onSubmit, onSubmitEvent, disabled }) {
  const fields = useMemo(() => normalizeFields(component), [component]);
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.initial || (field.options[0]?.value ?? '')])),
  );
  const [sent, setSent] = useState(false);

  const action = String(component.action ?? 'accion');
  const setValue = (name, value) => setValues((current) => ({ ...current, [name]: value }));

  const submit = () => {
    if (sent || disabled) return;
    const entries = fields
      .map((field) => [field, String(values[field.name] ?? '').trim()])
      .filter(([, value]) => value !== '');
    setSent(true);
    if (onSubmitEvent) {
      const context = {};
      for (const [field, value] of entries) {
        context[field.name] = field.kind === 'number' && Number.isFinite(Number(value)) ? Number(value) : value;
      }
      onSubmitEvent({ name: action, context });
      return;
    }
    onSubmit?.(`[form:${action}] ${entries.map(([field, value]) => `${field.name}=${value}`).join(', ')}`);
  };

  return (
    <Card style={styles.card}>
      {component.title ? <Text variant="h3">{component.title}</Text> : null}
      {component.description ? <Text variant="small">{component.description}</Text> : null}

      <View style={styles.fields}>
        {fields.map((field) => (
          <View key={field.name} style={styles.field}>
            <Text variant="tiny" style={styles.fieldLabel}>
              {field.label.toUpperCase()}
            </Text>
            {field.kind === 'select' ? (
              <Select field={field} value={values[field.name]} onChange={(value) => setValue(field.name, value)} />
            ) : (
              <TextInput
                style={styles.control}
                value={String(values[field.name] ?? '')}
                onChangeText={(value) => setValue(field.name, value)}
                placeholder={field.placeholder}
                placeholderTextColor={color.muted2}
                keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
                editable={!sent && !disabled}
                accessibilityLabel={field.label}
              />
            )}
          </View>
        ))}
      </View>

      <Button
        title={sent ? 'Enviado' : (component.submitLabel ?? 'Enviar')}
        onPress={submit}
        disabled={sent || disabled}
        icon={sent ? 'check' : undefined}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  fields: { gap: space.md },
  field: { gap: 5 },
  fieldLabel: { letterSpacing: 0.7, color: color.muted },
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: color.redTint },
});

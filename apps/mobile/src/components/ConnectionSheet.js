// Ajuste de la URL de la API sin recompilar.
//
// Existe por una razón muy concreta de hackathon: la app apunta al servidor de
// Vultr, pero si ese servidor se cae, el WiFi del evento bloquea el tráfico o
// hay que demostrar contra la laptop, cambiar la URL no puede costar un build
// de 20 minutos. Se guarda en el llavero y sobrevive a reinicios.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, Field, Text } from '../components/ui';
import Icon from './Icon';
import { getBaseUrl, getBuildDefault, resetBaseUrl, setBaseUrl } from '../lib/config';
import { fetchHealth } from '../api/endpoints';
import { color, radius, space } from '../theme/tokens';

export default function ConnectionSheet({ visible, onClose }) {
  const [value, setValue] = useState(getBaseUrl());
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(getBaseUrl());
      setProbe(null);
    }
  }, [visible]);

  // Guardar y probar van juntos: de nada sirve guardar una URL que no responde.
  async function saveAndTest() {
    setBusy(true);
    setProbe(null);
    await setBaseUrl(value);
    try {
      const health = await fetchHealth();
      setProbe({ ok: true, detail: `MCP ${health.mcp} · ${health.model ?? 'sin modelo'}` });
    } catch (err) {
      setProbe({ ok: false, detail: err?.message ?? 'Sin respuesta' });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    const restored = await resetBaseUrl();
    setValue(restored);
    setProbe(null);
    setBusy(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.head}>
            <Icon name="services" size={20} color={color.red} />
            <Text variant="h3" style={{ flex: 1 }}>
              Conexión con Banorte
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Icon name="close" size={20} color={color.muted} />
            </Pressable>
          </View>

          <Text variant="small">
            La app habla con nuestra API: el agente, el servidor MCP y la voz viven ahí. Cambia la dirección si la demo
            corre en otro lugar.
          </Text>

          <Field
            label="URL de la API"
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://mi-servidor:3040"
            hint={`Valor del build: ${getBuildDefault()}`}
          />

          {probe ? (
            <View style={[styles.probe, probe.ok ? styles.probeOk : styles.probeBad]}>
              <Icon name={probe.ok ? 'check' : 'alert'} size={17} color={probe.ok ? color.green : color.red600} />
              <Text variant="small" style={{ flex: 1 }}>
                {probe.ok ? `Conectado · ${probe.detail}` : `Sin conexión · ${probe.detail}`}
              </Text>
            </View>
          ) : null}

          <Button title="Guardar y probar" onPress={saveAndTest} loading={busy} icon="refresh" />
          <Button title="Restaurar la del build" onPress={restore} variant="ghost" disabled={busy} />

          <View style={styles.tips}>
            <Chip label="Emulador Android" />
            <Text variant="small" style={{ flex: 1 }}>
              localhost se traduce solo a 10.0.2.2.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,28,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxl + space.md,
    gap: space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  probe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
  },
  probeOk: { backgroundColor: 'rgba(15,143,77,0.10)', borderColor: 'rgba(15,143,77,0.28)' },
  probeBad: { backgroundColor: color.redTint, borderColor: color.redTint2 },
  tips: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
});

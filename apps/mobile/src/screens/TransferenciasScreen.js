// Transferencias.
//
// La pantalla NO transfiere: prepara la intención y se la pasa al agente, que
// genera el formulario de confirmación y ejecuta `transfer_funds`. Es
// deliberado y es la regla de seguridad del proyecto: el dinero solo se mueve
// tras el envío explícito de un formulario, nunca desde texto libre ni desde un
// atajo de la interfaz.

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Field, Loading, Text } from '../components/ui';
import Icon from '../components/Icon';
import { useDashboard } from '../lib/useDashboard';
import { fmtMoney } from '../lib/format';
import { color, radius, space } from '../theme/tokens';

// Iniciales del beneficiario para el avatar: dos letras, sin apellidos de más.
const initials = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

export default function TransferenciasScreen({ navigation }) {
  const { data, loading, refreshing, error, reload } = useDashboard();
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState(null);

  const beneficiaries = data?.beneficiaries ?? [];
  const accounts = (data?.accounts ?? []).filter((account) => account.type !== 'credit');

  const ask = (prompt) => navigation.navigate('Chat', { prompt, t: Date.now() });

  function start(beneficiary) {
    const clean = amount.replace(/[^0-9.]/g, '');
    const who = beneficiary.alias || beneficiary.name;
    ask(clean ? `Quiero transferir $${clean} a ${who}` : `Quiero hacer una transferencia a ${who}`);
    setAmount('');
    setSelected(null);
  }

  if (loading && !data) return <Loading label="Cargando tus beneficiarios…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={color.red} />}
    >
      <ErrorBanner message={error} onRetry={reload} />

      <Card style={{ gap: space.md }}>
        <Text variant="h3">Enviar dinero</Text>
        <Text variant="small">
          Elige a quién y el agente arma el formulario con tus cuentas reales. La operación se confirma ahí.
        </Text>
        <Field
          label="Monto (opcional)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          hint="Límite por operación: $50,000 MXN"
        />
      </Card>

      <View style={{ gap: space.md }}>
        <Text variant="h3">Tus beneficiarios</Text>
        {!beneficiaries.length ? (
          <EmptyState icon="transfers" title="Sin beneficiarios" description="Aún no tienes destinos guardados." />
        ) : null}
        {beneficiaries.map((beneficiary) => {
          const active = selected === beneficiary.id;
          return (
            <Pressable
              key={beneficiary.id}
              onPress={() => setSelected(active ? null : beneficiary.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Card style={[styles.person, active && styles.personActive]}>
                <View style={styles.avatar}>
                  <Text variant="bodyStrong" style={{ color: color.red }}>
                    {initials(beneficiary.name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {beneficiary.alias || beneficiary.name}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {beneficiary.bank} · {String(beneficiary.clabe ?? '').slice(-4).padStart(8, '•')}
                  </Text>
                </View>
                <Icon name={active ? 'chevron' : 'chevronRight'} size={18} color={color.muted} />
              </Card>

              {active ? (
                <View style={styles.personActions}>
                  <Button title="Continuar con el agente" icon="send" onPress={() => start(beneficiary)} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space.md }}>
        <Text variant="h3">Entre tus cuentas</Text>
        {accounts.map((account) => (
          <Card key={account.id} style={styles.person}>
            <View style={styles.avatar}>
              <Icon name="wallet" size={18} color={color.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {account.name}
              </Text>
              <Text variant="small">{fmtMoney(account.availableBalance ?? account.balance)} disponible</Text>
            </View>
            <Pressable
              onPress={() => ask(`Quiero mover dinero desde ${account.name} a mi otra cuenta`)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Transferir desde ${account.name}`}
            >
              <Icon name="exchange" size={20} color={color.red} />
            </Pressable>
          </Card>
        ))}
      </View>

      <Button
        title="Explícame cómo funciona SPEI"
        variant="ghost"
        onPress={() => ask('Explícame qué es SPEI y cuánto tarda una transferencia')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface2 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  personActive: { borderColor: color.red, borderWidth: 1.5 },
  personActions: { paddingTop: space.md },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.redTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Servicios: perfil, seguridad, conexión, tipo de cambio y crédito.
//
// Es también la pantalla de "administración" de la demo: desde aquí se ve con
// qué usuario estás dentro, se enciende o apaga el acceso biométrico y se
// cambia la URL de la API sin recompilar.

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Card, Chip, ErrorBanner, Text } from '../components/ui';
import Icon from '../components/Icon';
import ConnectionSheet from '../components/ConnectionSheet';
import { useAuth } from '../auth/AuthProvider';
import { biometryLabel } from '../auth/biometrics';
import { useDashboard } from '../lib/useDashboard';
import { getBaseUrl } from '../lib/config';
import { fmtLoginStamp, fmtMoney, fmtPercent } from '../lib/format';
import { color, radius, space } from '../theme/tokens';

function Row({ icon, title, subtitle, right, onPress }) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={color.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

export default function ServiciosScreen({ navigation }) {
  const { user, device, biometricOn, enableBiometrics, disableBiometrics, signOut } = useAuth();
  const { data, customer, refreshing, error, reload } = useDashboard();
  const [showConnection, setShowConnection] = useState(false);

  const biometry = biometryLabel(device.kind);
  const rates = data?.exchangeRates?.rates ?? [];
  const products = data?.creditProducts ?? [];

  const ask = (prompt) => navigation.navigate('Chat', { prompt, t: Date.now() });

  async function toggleBiometrics(next) {
    if (next) await enableBiometrics();
    else await disableBiometrics();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={color.red} />}
    >
      <ErrorBanner message={error} onRetry={reload} />

      {/* --- Perfil --- */}
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Icon name="user" size={28} color={color.red} />
        </View>
        <Text variant="h2">{user?.fullName ?? customer?.name ?? '—'}</Text>
        <Text variant="small">
          {customer?.segment ?? user?.segment ?? 'Cliente'} · {user?.customerId ?? '—'}
        </Text>
        {user?.lastLogin?.at ? (
          <Chip label={`Último ingreso · ${fmtLoginStamp(user.lastLogin.at)}`} tone="red" style={{ marginTop: 6 }} />
        ) : null}
        {customer?.branch ? <Text variant="small">{customer.branch}</Text> : null}
      </Card>

      {/* --- Seguridad --- */}
      <Card padded={false} style={styles.group}>
        <Text variant="h3" style={styles.groupTitle}>
          Seguridad
        </Text>
        <Row
          icon={biometry.icon}
          title={`Entrar con ${biometry.name}`}
          subtitle={
            device.available
              ? 'Tu token de sesión se guarda cifrado y solo se libera con tu biometría.'
              : 'Este dispositivo no tiene biometría registrada.'
          }
          right={
            <Switch
              value={biometricOn}
              onValueChange={toggleBiometrics}
              disabled={!device.available}
              trackColor={{ true: color.red, false: color.surface3 }}
              thumbColor={color.surface}
            />
          }
        />
        <Row
          icon="shield"
          title="Límite por transferencia"
          subtitle="$50,000 MXN por operación, validado en el servidor."
        />
      </Card>

      {/* --- Conexión --- */}
      <Card padded={false} style={styles.group}>
        <Text variant="h3" style={styles.groupTitle}>
          Conexión
        </Text>
        <Row
          icon="services"
          title="Servidor de Norte AI"
          subtitle={getBaseUrl()}
          right={<Icon name="chevronRight" size={18} color={color.muted} />}
          onPress={() => setShowConnection(true)}
        />
      </Card>

      {/* --- Tipo de cambio --- */}
      {rates.length ? (
        <Card padded={false} style={styles.group}>
          <Text variant="h3" style={styles.groupTitle}>
            Tipo de cambio
          </Text>
          {rates.map((rate) => (
            <Row
              key={rate.currency}
              icon="exchange"
              title={`${rate.currency} · ${rate.name}`}
              subtitle={`Compra ${fmtMoney(rate.buy)} · Venta ${fmtMoney(rate.sell)}`}
            />
          ))}
        </Card>
      ) : null}

      {/* --- Crédito --- */}
      {products.length ? (
        <Card padded={false} style={styles.group}>
          <Text variant="h3" style={styles.groupTitle}>
            Crédito
          </Text>
          {products.map((product) => (
            <Row
              key={product.id}
              icon="card"
              title={product.name}
              subtitle={`Desde ${fmtPercent(product.minRate)} anual · hasta ${product.maxMonths} meses`}
              right={<Icon name="chevronRight" size={18} color={color.muted} />}
              onPress={() => ask(`Simula un ${product.name} y muéstrame la tabla de pagos`)}
            />
          ))}
        </Card>
      ) : null}

      <Button title="Cerrar sesión" variant="outline" icon="logout" onPress={signOut} />

      <Text variant="tiny" style={styles.footer}>
        Norte AI · AuraTripleT · HackMTY × Banorte{'\n'}
        Datos sintéticos. Ningún cliente, cuenta ni movimiento es real.
      </Text>

      <ConnectionSheet visible={showConnection} onClose={() => setShowConnection(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface2 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },

  profile: { alignItems: 'center', gap: 3, paddingVertical: space.xl },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.redTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },

  group: { overflow: 'hidden' },
  groupTitle: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.redTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { textAlign: 'center', lineHeight: 16, marginTop: space.sm },
});

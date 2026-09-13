// Cuentas: saldos, reparto del gasto y últimos movimientos.
//
// Todo sale de las mismas herramientas MCP que usa el agente (`/api/dashboard`
// las llama en paralelo), así que la app nunca muestra un número que el
// asistente no pueda explicar. Cada bloque ofrece "preguntarle al agente", que
// es como se pasa de mirar un dato a hacer algo con él.

import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Loading, Text } from '../components/ui';
import Chart from '../charts/Chart';
import { BalanceCards, TransactionList } from '../renderer/components';
import { useDashboard } from '../lib/useDashboard';
import { fmtMoney } from '../lib/format';
import { color, space } from '../theme/tokens';

const ACCOUNT_KIND = { checking: 'checking', savings: 'savings', credit: 'credit' };

export default function CuentasScreen({ navigation }) {
  const { data, loading, refreshing, error, reload } = useDashboard();

  const ask = (prompt) => navigation.navigate('Chat', { prompt, t: Date.now() });

  if (loading && !data) return <Loading label="Consultando tus cuentas…" />;

  const accounts = data?.accounts ?? [];
  const spending = data?.spending;
  const cashflow = data?.cashflow ?? [];
  const transactions = data?.transactions ?? [];

  const liquid = accounts
    .filter((account) => account.type !== 'credit')
    .reduce((sum, account) => sum + (account.availableBalance ?? account.balance ?? 0), 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={color.red} />}
    >
      <ErrorBanner message={error} onRetry={reload} />

      {!accounts.length && !loading ? (
        <EmptyState icon="wallet" title="Sin cuentas" description="No pudimos leer tus cuentas desde el servidor." />
      ) : null}

      <Card style={styles.hero}>
        <Text variant="small">Disponible en tus cuentas</Text>
        <Text variant="h1" style={styles.heroValue}>
          {fmtMoney(liquid)}
        </Text>
        <Text variant="small">{accounts.length} productos contratados</Text>
      </Card>

      <BalanceCards
        component={{
          accounts: accounts.map((account) => ({
            name: account.name,
            number: account.number,
            balance: account.balance,
            kind: ACCOUNT_KIND[account.type] ?? 'checking',
            extra:
              account.type === 'credit'
                ? `Disponible ${fmtMoney(account.availableCredit)} · paga antes del ${account.paymentDue ?? '—'}`
                : `Disponible ${fmtMoney(account.availableBalance ?? account.balance)}`,
          })),
        }}
      />

      {spending?.categories?.length ? (
        <Chart
          component={{
            chartType: spending.categories.length > 6 ? 'horizontal_bar' : 'doughnut',
            title: 'En qué se te va el dinero',
            subtitle: `Total gastado: ${fmtMoney(spending.totalSpent)}`,
            labels: spending.categories.slice(0, 8).map((item) => item.category),
            datasets: [{ label: 'Gasto', data: spending.categories.slice(0, 8).map((item) => item.total) }],
          }}
        />
      ) : null}

      {cashflow.length > 1 ? (
        <Chart
          component={{
            chartType: 'profit_loss',
            title: 'Flujo mensual',
            subtitle: 'Lo que entra menos lo que sale',
            labels: cashflow.map((month) => month.month),
            datasets: [{ label: 'Neto', data: cashflow.map((month) => month.net) }],
          }}
        />
      ) : null}

      {transactions.length ? (
        <TransactionList
          component={{
            title: 'Últimos movimientos',
            items: transactions.slice(0, 8).map((tx) => ({
              date: tx.date,
              description: tx.description,
              category: tx.category,
              amount: tx.amount,
            })),
          }}
        />
      ) : null}

      <View style={styles.actions}>
        <Button
          title="¿Cómo puedo gastar menos?"
          variant="outline"
          icon="sparkle"
          onPress={() => ask('Analiza mis gastos del mes y dime en qué puedo recortar')}
        />
        <Button
          title="Explícame mi estado de cuenta"
          variant="ghost"
          onPress={() => ask('Explícame mi estado de cuenta con mis movimientos recientes')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface2 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  hero: { alignItems: 'center', gap: 2, paddingVertical: space.xl },
  heroValue: { fontSize: 30, lineHeight: 38, color: color.red },
  actions: { gap: space.sm, marginTop: space.sm },
});

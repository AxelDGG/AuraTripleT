// Inversiones: lo contratado en Banorte y el portafolio bursátil.
//
// El selector de rango vuelve a pedir la serie que ya trae `/api/dashboard`
// (get_portfolio_performance con range ALL devuelve las cinco de una vez), así
// que cambiar de 1D a 1Y no cuesta una llamada nueva.

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Loading, Text } from '../components/ui';
import Chart from '../charts/Chart';
import { KpiGrid } from '../renderer/components';
import { useDashboard } from '../lib/useDashboard';
import { fmtDate, fmtMoney, fmtPercent } from '../lib/format';
import { color, radius, space } from '../theme/tokens';

const RANGES = ['1D', '1W', '1M', '6M', '1Y'];

function pointLabel(iso, range) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (range === '1D') return `${String(date.getHours()).padStart(2, '0')}:00`;
  return fmtDate(date);
}

export default function InversionesScreen({ navigation }) {
  const { data, loading, refreshing, error, reload } = useDashboard();
  const [range, setRange] = useState('1M');

  const ask = (prompt) => navigation.navigate('Chat', { prompt, t: Date.now() });

  if (loading && !data) return <Loading label="Consultando tus inversiones…" />;

  const investments = data?.investments;
  const portfolio = data?.portfolio;
  const performance = data?.performance?.ranges?.[range];
  const watchlist = data?.watchlist?.items ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={color.red} />}
    >
      <ErrorBanner message={error} onRetry={reload} />

      {!investments && !portfolio && !loading ? (
        <EmptyState icon="investments" title="Sin inversiones" description="No pudimos leer tu portafolio." />
      ) : null}

      {investments ? (
        <KpiGrid
          component={{
            items: [
              { label: 'Invertido', value: fmtMoney(investments.totalInvested), icon: '🏦' },
              {
                label: 'Rendimiento',
                value: fmtMoney(investments.totalGain),
                trend: investments.totalGain >= 0 ? 'up' : 'down',
                delta: investments.totalInvested
                  ? fmtPercent((investments.totalGain / investments.totalInvested) * 100)
                  : undefined,
                icon: '📈',
              },
            ],
          }}
        />
      ) : null}

      {investments?.investments?.length ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Text variant="h3" style={styles.cardTitle}>
            Tus productos
          </Text>
          {investments.investments.map((item, index) => (
            <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="small">
                  {item.type} · {fmtPercent(item.rate)} anual{item.maturity ? ` · vence ${item.maturity}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyStrong">{fmtMoney(item.amount)}</Text>
                <Text variant="small" style={{ color: item.gain >= 0 ? color.green : color.red600 }}>
                  {item.gain >= 0 ? '+' : ''}
                  {fmtMoney(item.gain)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {portfolio ? (
        <>
          <View style={styles.ranges}>
            {RANGES.map((item) => {
              const active = item === range;
              return (
                <Pressable
                  key={item}
                  onPress={() => setRange(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.range, active && styles.rangeActive]}
                >
                  <Text variant="smallStrong" style={{ color: active ? color.onRed : color.ink2 }}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {performance?.points?.length ? (
            <Chart
              component={{
                chartType: 'area',
                title: `Portafolio ${portfolio.currency}`,
                subtitle: `${fmtMoney(portfolio.totalValue)} · ${portfolio.totalChangePct >= 0 ? '+' : ''}${fmtPercent(portfolio.totalChangePct)}`,
                format: 'compact',
                // Los puntos vienen como { t: ISO, v: number }. En 1D importa la
                // hora; en los rangos largos, el día.
                labels: performance.points.map((point) => pointLabel(point.t, range)),
                datasets: [{ label: 'Valor', data: performance.points.map((point) => point.v ?? 0) }],
                legend: false,
              }}
            />
          ) : null}

          {portfolio.allocation?.length ? (
            <Chart
              component={{
                chartType: 'doughnut',
                title: 'Distribución',
                format: 'percent',
                labels: portfolio.allocation.map((item) => item.symbol),
                datasets: [{ label: 'Peso', data: portfolio.allocation.map((item) => item.pct) }],
              }}
            />
          ) : null}
        </>
      ) : null}

      {watchlist.length ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Text variant="h3" style={styles.cardTitle}>
            Más vistas del mercado
          </Text>
          {watchlist.slice(0, 6).map((item, index) => (
            <View key={item.symbol} style={[styles.row, index > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{item.symbol}</Text>
                <Text variant="small" numberOfLines={1}>
                  {item.name} · {item.exchange}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyStrong">{`$${item.price}`}</Text>
                <Text variant="small" style={{ color: item.changePct >= 0 ? color.green : color.red600 }}>
                  {item.changePct >= 0 ? '+' : ''}
                  {fmtPercent(item.changePct)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Button
        title="¿Me conviene invertir más?"
        variant="outline"
        icon="sparkle"
        onPress={() => ask('Con mi perfil y mis saldos, ¿me conviene mover dinero a inversión? Compara mis opciones')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface2 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  cardTitle: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingVertical: space.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: color.line },
  ranges: { flexDirection: 'row', gap: space.sm },
  range: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: color.surface3,
  },
  rangeActive: { backgroundColor: color.red },
});

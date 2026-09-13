// Componentes de Norte UI Spec v1 en nativo.
//
// Mismo contrato que apps/web/public/renderer.js y los mismos nombres de campo:
// el agente emite un solo JSON y cada plataforma lo pinta con lo suyo. Aquí no
// hay HTML ni `dangerouslySetInnerHTML` — el texto del modelo siempre entra por
// un <Text>, así que no hay forma de que inyecte interfaz.

import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Chip, Text } from '../components/ui';
import Icon from '../components/Icon';
import { color, radius, space } from '../theme/tokens';
import { fmtDate, fmtMoney } from '../lib/format';
import { resolveTableColumns, tableRow } from '../a2ui/core/tables';

const CATEGORY_ICONS = {
  ingresos: '💵', supermercado: '🛒', restaurantes: '🍽️', entretenimiento: '🎬',
  servicios: '💡', transporte: '🚗', compras: '🛍️', salud: '⚕️', hogar: '🏠',
  vivienda: '🏢', ahorro: '🐷', transferencias: '↔️', 'pagos tdc': '💳',
};

const categoryIcon = (category) => CATEGORY_ICONS[String(category ?? '').toLowerCase()] ?? '•';

// ---------- header ----------

export function Header({ component }) {
  return (
    <View style={styles.header}>
      {component.badge ? <Chip label={component.badge} tone="red" /> : null}
      <Text variant="h1">{component.title ?? ''}</Text>
      {component.subtitle ? <Text variant="small">{component.subtitle}</Text> : null}
    </View>
  );
}

// ---------- kpi_grid ----------

const TREND_COLOR = { up: color.green, down: color.red600, neutral: color.muted };

export function KpiGrid({ component }) {
  const items = Array.isArray(component.items) ? component.items.slice(0, 4) : [];
  if (!items.length) return null;
  return (
    <View style={styles.kpiGrid}>
      {items.map((item, index) => (
        <Card key={index} style={styles.kpi}>
          <View style={styles.kpiLabel}>
            {item.icon ? <Text variant="small">{String(item.icon)}</Text> : null}
            <Text variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>
              {item.label ?? ''}
            </Text>
          </View>
          <Text variant="number" numberOfLines={1} adjustsFontSizeToFit>
            {item.value ?? '—'}
          </Text>
          {item.delta ? (
            <Text variant="smallStrong" style={{ color: TREND_COLOR[item.trend] ?? color.muted }}>
              {item.delta}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

// ---------- balance_cards ----------

const ACCOUNT_META = {
  checking: { label: 'Cheques', icon: 'wallet' },
  savings: { label: 'Ahorro', icon: 'target' },
  credit: { label: 'Crédito', icon: 'card' },
};

export function BalanceCards({ component }) {
  const accounts = Array.isArray(component.accounts) ? component.accounts : [];
  if (!accounts.length) return null;
  return (
    <View style={styles.stack}>
      {accounts.map((account, index) => {
        const meta = ACCOUNT_META[account.kind] ?? ACCOUNT_META.checking;
        const isCredit = account.kind === 'credit';
        return (
          <Card key={index} style={styles.account}>
            <View style={styles.accountIcon}>
              <Icon name={meta.icon} size={20} color={color.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {account.name ?? meta.label}
              </Text>
              <Text variant="small">
                {[meta.label, account.number].filter(Boolean).join(' · ')}
              </Text>
              {account.extra ? <Text variant="small">{account.extra}</Text> : null}
            </View>
            <Text variant="h3" style={isCredit ? { color: color.red600 } : null}>
              {fmtMoney(account.balance)}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}

// ---------- table ----------
//
// Con más de tres columnas la tabla se desplaza en horizontal en vez de
// aplastar el texto: en un teléfono es preferible arrastrar a no poder leer.

export function Table({ component }) {
  const rows = Array.isArray(component.rows) ? component.rows : [];
  // Las filas llegan como arreglos o como objetos (cuando `rows` es un binding
  // al dataModel): las columnas se resuelven contra ellas para que cada celda
  // caiga en su columna en vez de pintarse como un solo "[object Object]".
  const columns = resolveTableColumns(component.columns, rows);
  if (!columns.length && !rows.length) return null;

  const scrolls = columns.length > 3;
  const minWidth = scrolls ? columns.length * 120 : undefined;

  const body = (
    <View style={{ minWidth }}>
      <View style={styles.tableHeadRow}>
        {columns.map((col, index) => (
          <Text key={index} variant="tiny" numberOfLines={2} style={[styles.tableCell, styles.tableHeadCell]}>
            {col.label.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.tableRow, rowIndex % 2 === 1 && styles.tableRowAlt]}>
          {tableRow(row, columns).map((cell, cellIndex) => (
            <Text key={cellIndex} variant="small" numberOfLines={2} style={[styles.tableCell, { color: color.ink2 }]}>
              {cell === null || cell === undefined || cell === '' ? '—' : String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <Card padded={false} style={styles.tableCard}>
      {component.title ? (
        <Text variant="h3" style={styles.tableTitle}>
          {component.title}
        </Text>
      ) : null}
      {scrolls ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{body}</ScrollView> : body}
    </Card>
  );
}

// ---------- transaction_list ----------

export function TransactionList({ component }) {
  const items = Array.isArray(component.items) ? component.items : [];
  if (!items.length) return null;
  return (
    <Card padded={false} style={styles.tableCard}>
      {component.title ? (
        <Text variant="h3" style={styles.tableTitle}>
          {component.title}
        </Text>
      ) : null}
      {items.map((item, index) => {
        const amount = Number(item.amount ?? 0);
        return (
          <View key={index} style={[styles.txRow, index > 0 && styles.txRowBorder]}>
            <View style={styles.txIcon}>
              <Text variant="body">{categoryIcon(item.category)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {item.description ?? ''}
              </Text>
              <Text variant="small">{[fmtDate(item.date), item.category].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text variant="bodyStrong" style={{ color: amount < 0 ? color.red600 : color.green }}>
              {fmtMoney(amount)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

// ---------- alert ----------

const ALERT_TONE = {
  success: { bg: 'rgba(15,143,77,0.10)', border: 'rgba(15,143,77,0.30)', fg: color.green, icon: 'check' },
  warning: { bg: 'rgba(184,119,10,0.10)', border: 'rgba(184,119,10,0.30)', fg: color.amber, icon: 'alert' },
  error: { bg: color.redTint, border: color.redTint2, fg: color.red600, icon: 'alert' },
  info: { bg: 'rgba(31,95,191,0.09)', border: 'rgba(31,95,191,0.26)', fg: color.blue, icon: 'sparkle' },
};

export function Alert({ component }) {
  const tone = ALERT_TONE[component.level] ?? ALERT_TONE.info;
  return (
    <View style={[styles.alert, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Icon name={tone.icon} size={19} color={tone.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {component.title ? (
          <Text variant="bodyStrong" style={{ color: tone.fg }}>
            {component.title}
          </Text>
        ) : null}
        {component.text ? <Text variant="small" style={{ color: color.ink2 }}>{component.text}</Text> : null}
      </View>
    </View>
  );
}

// ---------- progress ----------

export function Progress({ component }) {
  const value = Math.max(0, Math.min(Number(component.value ?? 0), 100));
  return (
    <Card style={{ gap: space.sm }}>
      <View style={styles.progressHead}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {component.label ?? ''}
        </Text>
        <Text variant="bodyStrong" style={{ color: color.red }}>{`${Math.round(value)}%`}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${value}%` }]} />
      </View>
      {component.caption ? <Text variant="small">{component.caption}</Text> : null}
    </Card>
  );
}

// ---------- text ----------
//
// Mini-markdown: **negritas** y `código`. Se parte la cadena y cada trozo entra
// como texto plano, nunca como marcado interpretado.

export function Markdown({ component }) {
  const source = String(component.markdown ?? component.text ?? '');
  if (!source.trim()) return null;
  const parts = source.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text variant="body" style={styles.markdown}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={index} variant="bodyStrong">
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={index} variant="body" style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  kpi: { flexGrow: 1, flexBasis: '46%', gap: 4, paddingVertical: space.md },
  kpiLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  stack: { gap: space.md },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.redTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tableCard: { overflow: 'hidden' },
  tableTitle: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  tableHeadRow: { flexDirection: 'row', backgroundColor: color.surface2, paddingVertical: space.sm },
  tableHeadCell: { color: color.muted },
  tableRow: { flexDirection: 'row', paddingVertical: space.md, alignItems: 'center' },
  tableRowAlt: { backgroundColor: 'rgba(20,20,28,0.022)' },
  tableCell: { flex: 1, paddingHorizontal: space.md },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingVertical: space.md },
  txRowBorder: { borderTopWidth: 1, borderTopColor: color.line },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  alert: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'flex-start',
  },

  progressHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: color.surface3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: color.red },

  markdown: { paddingHorizontal: 2 },
  code: { fontFamily: 'monospace', fontSize: 13, color: color.red700 },
});

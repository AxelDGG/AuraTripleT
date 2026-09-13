// DataTable de Norte A2UI en nativo.
//
// Gemelo del de apps/web/public/js/a2ui-web.js: filas como objetos, una columna
// describe su `key`, su `format` y su alineación, el encabezado ordena al
// tocarlo y `pageSize` pagina. Es lo que se usa cuando hay varias filas
// comparables o con estado (pagos programados, tarjetas, recordatorios), donde
// Table —filas como arreglos, sin formato— se queda corta.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text } from '../components/ui';
import { color, radius, space } from '../theme/tokens';
import { formatCurrency, formatDate, formatNumber, formatPercent } from './core/format';

const asText = (v) => (v === undefined || v === null ? '' : String(v));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

// Estados frecuentes de un pago o una cita → tono del badge. Lo que no reconoce
// se pinta neutro: el modelo escribe la etiqueta que quiera y nunca queda rota.
const BADGE_TONES = {
  ok: ['pagado', 'pagada', 'programado', 'programada', 'agendado', 'agendada', 'activo', 'activa', 'ok', 'success', 'completado', 'liquidado', 'al corriente'],
  warn: ['pendiente', 'por pagar', 'proximo', 'en riesgo', 'warning', 'parcial'],
  danger: ['vencido', 'vencida', 'atrasado', 'atrasada', 'rechazado', 'error', 'cancelado', 'cancelada'],
};

const BADGE_STYLE = {
  ok: { bg: 'rgba(15,143,77,0.12)', fg: color.green },
  warn: { bg: 'rgba(184,119,10,0.12)', fg: color.amber },
  danger: { bg: color.redTint, fg: color.red600 },
  neutral: { bg: color.surface2, fg: color.muted },
};

// Sin String.normalize('NFD'): Hermes no garantiza la descomposición, así que
// los acentos se quitan con una tabla corta (es el mismo juego de palabras).
const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
const deaccent = (value) => asText(value).toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c);

function badgeTone(value) {
  const text = deaccent(value);
  for (const [tone, words] of Object.entries(BADGE_TONES)) {
    if (words.some((word) => text.includes(deaccent(word)))) return tone;
  }
  return 'neutral';
}

function formatCell(value, format) {
  if (value === undefined || value === null || value === '') return '—';
  switch (format) {
    case 'currency': return typeof value === 'number' ? formatCurrency(value) : asText(value);
    case 'date': return formatDate(value);
    case 'number': return Number.isFinite(Number(value)) ? formatNumber(value, { decimals: 2, trim: true }) : asText(value);
    case 'percent': return Number.isFinite(Number(value)) ? formatPercent(value) : asText(value);
    default: return typeof value === 'number' ? formatCurrency(value) : asText(value);
  }
}

export function DataTable({ props }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);

  const columns = list(props.columns).map((c, i) => (isObject(c)
    ? { key: asText(c.key ?? c.field ?? i), label: asText(c.label ?? c.key ?? c.field ?? ''), format: c.format, align: c.align }
    : { key: asText(c), label: asText(c), format: undefined, align: undefined }));
  // Una fila puede venir como objeto (lo normal) o como arreglo del orden de
  // las columnas, que es lo que el modelo escribe cuando confunde Table.
  const rows = list(props.rows).map((row) => (isObject(row)
    ? row
    : Object.fromEntries(columns.map((c, i) => [c.key, Array.isArray(row) ? row[i] : row]))));

  const title = props.title ? <Text variant="h3" style={styles.title}>{asText(props.title)}</Text> : null;
  if (!columns.length || !rows.length) {
    return (
      <Card style={{ gap: space.sm }}>
        {title}
        <Text variant="small">{asText(props.emptyText ?? 'Sin datos que mostrar.')}</Text>
      </Card>
    );
  }

  const sorted = sort
    ? [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : asText(x).localeCompare(asText(y), 'es');
      return sort.dir === 'desc' ? -cmp : cmp;
    })
    : rows;

  const pageSize = Number(props.pageSize) > 0 ? Math.floor(Number(props.pageSize)) : 0;
  const pages = pageSize ? Math.ceil(sorted.length / pageSize) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted;

  const scrolls = columns.length > 3;
  const body = (
    <View style={{ minWidth: scrolls ? columns.length * 120 : undefined }}>
      <View style={styles.headRow}>
        {columns.map((col) => {
          const active = sort?.key === col.key;
          return (
            <Pressable
              key={col.key}
              onPress={() => {
                setSort(active && sort.dir === 'asc' ? { key: col.key, dir: 'desc' } : { key: col.key, dir: 'asc' });
                setPage(0);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ordenar por ${col.label}`}
              style={styles.cell}
            >
              <Text variant="tiny" numberOfLines={2} style={[col.align === 'right' && styles.right, active && { color: color.red }]}>
                {`${col.label.toUpperCase()}${active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visible.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, rowIndex % 2 === 1 && styles.rowAlt]}>
          {columns.map((col) => {
            const value = row[col.key];
            if (col.format === 'badge') {
              const tone = BADGE_STYLE[badgeTone(value)];
              return (
                <View key={col.key} style={styles.cell}>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text variant="tiny" numberOfLines={1} style={{ color: tone.fg }}>
                      {asText(value) || '—'}
                    </Text>
                  </View>
                </View>
              );
            }
            return (
              <Text
                key={col.key}
                variant="small"
                numberOfLines={2}
                style={[styles.cell, { color: color.ink2 }, col.align === 'right' && styles.right]}
              >
                {formatCell(value, col.format)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <Card padded={false} style={styles.card}>
      {title}
      {scrolls ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{body}</ScrollView> : body}
      {pages > 1 ? (
        <View style={styles.foot}>
          <Pressable
            onPress={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            accessibilityRole="button"
            accessibilityLabel="Página anterior"
            style={({ pressed }) => [styles.pageBtn, current === 0 && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}
          >
            <Text variant="smallStrong">Anterior</Text>
          </Pressable>
          <Text variant="small">{`${current + 1} de ${pages} · ${sorted.length} filas`}</Text>
          <Pressable
            onPress={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            accessibilityRole="button"
            accessibilityLabel="Página siguiente"
            style={({ pressed }) => [styles.pageBtn, current >= pages - 1 && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}
          >
            <Text variant="smallStrong">Siguiente</Text>
          </Pressable>
        </View>
      ) : null}
      {props.caption ? <Text variant="small" style={styles.caption}>{asText(props.caption)}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  title: { padding: space.md, paddingBottom: space.sm },
  headRow: { flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: color.surface2 },
  row: { flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center' },
  rowAlt: { backgroundColor: color.surface2 },
  cell: { flex: 1, paddingRight: space.sm, minWidth: 0 },
  right: { textAlign: 'right' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, gap: space.sm },
  pageBtn: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: color.surface2 },
  caption: { paddingHorizontal: space.md, paddingBottom: space.md },
});

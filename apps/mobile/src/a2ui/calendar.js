// Calendar y DatePicker de Norte A2UI en nativo.
//
// Gemelos de los de apps/web/public/js/a2ui-web.js: mismas props, mismos
// nombres y la misma rejilla de lunes a domingo. Los dos se apoyan en
// <MonthGrid>, que es de solo lectura hasta que se le pasa `onPick`.
//
// Las fechas "YYYY-MM-DD" se parsean a mano a propósito: new Date("2026-09-15")
// se interpreta en UTC y en México se corre un día hacia atrás.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text } from '../components/ui';
import { color, radius, space } from '../theme/tokens';
import { formatDate } from './core/format';

const asText = (v) => (v === undefined || v === null ? '' : String(v));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Color de la marca de cada día, por tipo de evento.
const EVENT_COLOR = { payment: color.red, due: color.amber, personal: color.blue, info: color.muted };
const eventKind = (item) => (item?.kind in EVENT_COLOR ? item.kind : 'info');

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asText(value));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

// "2026-09" o "2026-09-15" → primer día de ese mes.
function parseMonth(value) {
  const match = /^(\d{4})-(\d{2})/.exec(asText(value));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
}

// Semanas de lunes a domingo que cubren el mes, con los días de relleno.
function monthMatrix(monthStart) {
  const first = startOfMonth(monthStart);
  const offset = (first.getDay() + 6) % 7; // getDay: 0=domingo → semana que arranca en lunes
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
    cells.push({ date, iso: toISODate(date), inMonth: date.getMonth() === first.getMonth() });
  }
  // La sexta semana solo se dibuja si el mes de verdad llega hasta ahí.
  return cells.slice(0, cells[35].inMonth ? 42 : 35);
}

function eventsByDate(value) {
  const map = new Map();
  for (const item of Array.isArray(value) ? value.filter(isObject) : []) {
    const iso = toISODate(parseISODate(item.date));
    if (!iso) continue;
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso).push(item);
  }
  return map;
}

// La ruta a la que escribe el componente, si el modelo la ligó.
const isBound = (raw) => isObject(raw?.value) && typeof raw.value.path === 'string';

// ---------- rejilla ----------

function MonthGrid({ monthStart, selectedIso, events, min, max, onPick, onMonth }) {
  const todayIso = toISODate(new Date());
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.head}>
        <Pressable
          onPress={() => onMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          hitSlop={10}
          style={({ pressed }) => [styles.nav, pressed && { opacity: 0.5 }]}
        >
          <Text variant="h3">‹</Text>
        </Pressable>
        <Text variant="bodyStrong">{`${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`}</Text>
        <Pressable
          onPress={() => onMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          hitSlop={10}
          style={({ pressed }) => [styles.nav, pressed && { opacity: 0.5 }]}
        >
          <Text variant="h3">›</Text>
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((day, i) => (
          <Text key={i} variant="tiny" style={styles.weekDay}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {monthMatrix(monthStart).map((cell) => {
          const dayEvents = events.get(cell.iso) ?? [];
          const disabled = (minDate && cell.date < minDate) || (maxDate && cell.date > maxDate);
          const selected = Boolean(selectedIso) && cell.iso === selectedIso;
          const pickable = Boolean(onPick) && !disabled;
          const content = (
            <>
              <Text
                variant={selected ? 'smallStrong' : 'small'}
                style={[
                  selected && { color: color.onRed },
                  !cell.inMonth && { color: color.muted2 },
                  disabled && !selected && { color: color.muted2 },
                ]}
              >
                {cell.date.getDate()}
              </Text>
              <View style={styles.dots}>
                {dayEvents.slice(0, 3).map((item, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: selected ? color.onRed : EVENT_COLOR[eventKind(item)] }]} />
                ))}
              </View>
            </>
          );
          const cellStyle = [
            styles.day,
            cell.iso === todayIso && !selected && styles.dayToday,
            selected && styles.daySelected,
            disabled && { opacity: 0.4 },
          ];
          return pickable ? (
            <Pressable
              key={cell.iso}
              onPress={() => onPick(cell.iso)}
              accessibilityRole="button"
              accessibilityLabel={`${cell.date.getDate()} de ${MONTH_NAMES[cell.date.getMonth()]}`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [...cellStyle, pressed && { opacity: 0.6 }]}
            >
              {content}
            </Pressable>
          ) : (
            <View key={cell.iso} style={cellStyle}>
              {content}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// El mes visible: manda la navegación de la persona y, si no ha navegado, lo
// que diga el componente (que puede cambiar con un patch del agente).
function useVisibleMonth(...candidates) {
  const [override, setOverride] = useState(null);
  const fallback = candidates.find(Boolean) ?? startOfMonth(new Date());
  return [override ?? fallback, setOverride];
}

// ---------- Calendar ----------

export function Calendar({ props, ctx }) {
  const events = eventsByDate(props.events);
  const selectedIso = toISODate(parseISODate(props.value ?? props.selected));
  const [monthStart, setMonth] = useVisibleMonth(parseMonth(props.month), parseMonth(selectedIso));
  const pickable = isBound(ctx.raw) && !ctx.disabled;

  // Los eventos del día elegido; si no hay ninguno, los del mes visible.
  const visibleMonth = toISODate(monthStart).slice(0, 7);
  const listed = selectedIso && events.has(selectedIso)
    ? events.get(selectedIso).map((e) => ({ ...e, date: selectedIso }))
    : [...events.entries()]
      .filter(([iso]) => iso.slice(0, 7) === visibleMonth)
      .flatMap(([iso, items]) => items.map((e) => ({ ...e, date: iso })))
      .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card style={{ gap: space.md }}>
      {props.title ? <Text variant="h3">{asText(props.title)}</Text> : null}
      <MonthGrid
        monthStart={monthStart}
        selectedIso={selectedIso}
        events={events}
        min={props.min}
        max={props.max}
        onMonth={setMonth}
        onPick={pickable ? (iso) => { setMonth(parseMonth(iso)); ctx.setData(iso); } : null}
      />
      {listed.length ? (
        <View style={styles.events}>
          {listed.slice(0, 6).map((item, i) => (
            <View key={`${item.date}-${i}`} style={styles.event}>
              <View style={[styles.dot, styles.eventDot, { backgroundColor: EVENT_COLOR[eventKind(item)] }]} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {asText(item.label ?? item.summary ?? 'Evento')}
                </Text>
                <Text variant="small">{formatDate(item.date)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : props.emptyText ? (
        <Text variant="small">{asText(props.emptyText)}</Text>
      ) : null}
    </Card>
  );
}

// ---------- DatePicker ----------

export function DatePicker({ props, ctx }) {
  const [open, setOpen] = useState(false);
  const selectedIso = toISODate(parseISODate(props.value));
  const [monthStart, setMonth] = useVisibleMonth(parseMonth(selectedIso), parseMonth(props.month));

  return (
    <View style={{ gap: 5 }}>
      {props.label ? (
        <Text variant="tiny" style={styles.label}>
          {asText(props.label).toUpperCase()}
        </Text>
      ) : null}
      <Pressable
        onPress={() => !ctx.disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${asText(props.label)}. ${selectedIso ? formatDate(selectedIso) : 'Sin fecha'}`}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.75 }, ctx.disabled && { opacity: 0.5 }]}
      >
        <Text variant="body">📅</Text>
        <Text variant="body" style={{ flex: 1, color: selectedIso ? color.ink : color.muted2 }}>
          {selectedIso ? formatDate(selectedIso) : asText(props.placeholder ?? 'Elegir fecha')}
        </Text>
      </Pressable>
      {props.hint ? <Text variant="small">{asText(props.hint)}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text variant="h3" style={{ marginBottom: space.sm }}>
              {asText(props.label ?? 'Elegir fecha')}
            </Text>
            <ScrollView>
              <MonthGrid
                monthStart={monthStart}
                selectedIso={selectedIso}
                events={eventsByDate(props.events)}
                min={props.min}
                max={props.max}
                onMonth={setMonth}
                onPick={(iso) => {
                  setMonth(parseMonth(iso));
                  ctx.setData(iso);
                  setOpen(false);
                }}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: color.surface2 },
  week: { flexDirection: 'row' },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  day: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  dayToday: { backgroundColor: color.surface2 },
  daySelected: { backgroundColor: color.red },
  dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  events: { gap: space.sm },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eventDot: { width: 7, height: 7, borderRadius: 4 },
  label: { color: color.muted, letterSpacing: 0.6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,28,0.45)', justifyContent: 'center', padding: space.lg },
  sheet: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, maxHeight: '80%' },
});

// Renderer nativo de Norte A2UI v2.
//
// Es el gemelo de apps/web/public/js/a2ui-web.js sobre el mismo runtime
// (src/a2ui/core, copia sincronizada de packages/a2ui-schema/src/core): recibe
// mensajes del protocolo por el store, resuelve bindings contra el dataModel y
// pinta cada componente con las piezas nativas propias. React vuelve a
// reconciliar el árbol cuando el store avisa; los controles escriben en el
// modelo y todo lo derivado se recalcula en el teléfono.
//
// Lo que no reconoce se ignora en lugar de tumbar la vista: media pantalla
// vale más que un error rojo.

import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Chart from '../charts/Chart';
import Form from '../renderer/Form';
import { Alert, BalanceCards, Header, Markdown, Progress, Table, TransactionList } from '../renderer/components';
import { Card, Divider as UiDivider, SegmentedTabs, Text } from '../components/ui';
import { color, radius, space } from '../theme/tokens';
import { CATALOG_ID, COMPONENT_NAMES_V2, ROOT_ID, createSurfaceStore } from './core/index';
import { formatCurrency } from './core/format';
import { Button, ChoiceChips, Select, Slider, TextField, Toggle } from './inputs';

// Un solo store para la app: el chat, el historial y el widget comparten superficies.
export const surfaceStore = createSurfaceStore();

const asText = (v) => (v === undefined || v === null ? '' : String(v));
const moneyOrText = (v) => (typeof v === 'number' ? formatCurrency(v) : asText(v));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------- layout ----------

function Stack({ props, ctx }) {
  const gap = { sm: space.sm, md: space.md, lg: space.xl }[props.gap] ?? space.md;
  return <View style={{ gap }}>{ctx.children()}</View>;
}

function Row({ props, ctx }) {
  return <View style={[styles.row, props.wrap === false && { flexWrap: 'nowrap' }]}>{ctx.children().map((child, i) => <View key={i} style={styles.rowItem}>{child}</View>)}</View>;
}

function Grid({ props, ctx }) {
  const children = ctx.children();
  const cols = Math.max(1, Math.min(4, Number(props.columns) || Math.min(2, children.length)));
  // En un teléfono más de dos columnas no se lee: se acotan a dos.
  const basis = cols === 1 ? '100%' : '47%';
  return <View style={styles.grid}>{children.map((child, i) => <View key={i} style={{ flexGrow: 1, flexBasis: basis, minWidth: 0 }}>{child}</View>)}</View>;
}

function CardBlock({ props, ctx }) {
  return (
    <Card style={{ gap: space.md }}>
      {props.title ? <Text variant="h3">{asText(props.title)}</Text> : null}
      {props.subtitle ? <Text variant="small">{asText(props.subtitle)}</Text> : null}
      {ctx.children()}
    </Card>
  );
}

function Section({ props, ctx }) {
  return (
    <View style={{ gap: space.md }}>
      {props.title || props.subtitle ? (
        <View style={{ gap: 2 }}>
          {props.title ? <Text variant="h2">{asText(props.title)}</Text> : null}
          {props.subtitle ? <Text variant="small">{asText(props.subtitle)}</Text> : null}
        </View>
      ) : null}
      {ctx.children()}
    </View>
  );
}

function Tabs({ ctx }) {
  const items = Array.isArray(ctx.raw.items) ? ctx.raw.items.filter((t) => isObject(t) && typeof t.child === 'string') : [];
  const [active, setActive] = useState(items[0]?.child ?? null);
  if (!items.length) return null;
  const current = items.find((t) => t.child === active) ?? items[0];
  return (
    <View style={{ gap: space.md }}>
      <SegmentedTabs items={items.map((t) => ({ id: t.child, label: asText(t.label) }))} value={current.child} onChange={setActive} />
      {ctx.renderChild(current.child, ctx.scope)}
    </View>
  );
}

function Divider() {
  return <UiDivider />;
}

function List({ props, ctx }) {
  const rows = ctx.rows();
  return (
    <View style={{ gap: space.sm }}>
      {props.title ? <Text variant="h3">{asText(props.title)}</Text> : null}
      {rows.length ? rows.map((row) => <View key={row.scope}>{ctx.renderChild(row.componentId, row.scope)}</View>) : <Text variant="small">{asText(props.emptyText ?? 'Sin elementos.')}</Text>}
    </View>
  );
}

// ---------- dominio (reusa los componentes v1) ----------

const TREND_COLOR = { up: color.green, down: color.red600, neutral: color.muted };

function Kpi({ props }) {
  return (
    <Card style={styles.kpi}>
      <View style={styles.kpiLabel}>
        {props.icon ? <Text variant="small">{asText(props.icon)}</Text> : null}
        <Text variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>
          {asText(props.label)}
        </Text>
      </View>
      <Text variant="number" numberOfLines={1} adjustsFontSizeToFit>
        {moneyOrText(props.value) || '—'}
      </Text>
      {props.delta ? (
        <Text variant="smallStrong" style={{ color: TREND_COLOR[props.trend] ?? color.muted }}>
          {asText(props.delta)}
        </Text>
      ) : null}
    </Card>
  );
}

function Skeleton({ props }) {
  const blocks = { header: 2, chart: 1, cards: 2, kpis: 2, list: 3, form: 2, plan: 3, text: 2 }[props.variant] ?? 2;
  const tall = props.variant === 'chart' || props.variant === 'plan';
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: blocks }, (_, i) => (
        <View key={i} style={[styles.skeleton, tall && i === blocks - 1 && { height: 160 }, props.variant === 'header' && i === 0 && { width: '55%', height: 24 }]} />
      ))}
    </View>
  );
}

const REGISTRY = {
  Stack,
  Row,
  Grid,
  Card: CardBlock,
  Section,
  Tabs,
  Divider,
  List,
  Header: ({ props }) => <Header component={props} />,
  Kpi,
  AccountCard: ({ props }) => <BalanceCards component={{ accounts: [props] }} />,
  Chart: ({ props }) => <Chart component={props} />,
  Table: ({ props }) => <Table component={props} />,
  TransactionList: ({ props }) => <TransactionList component={props} />,
  Alert: ({ props }) => <Alert component={props} />,
  Progress: ({ props }) => <Progress component={props} />,
  Text: ({ props }) => <Markdown component={props} />,
  Skeleton,
  Slider,
  Select,
  ChoiceChips,
  TextField,
  Toggle,
  Button,
  Form: ({ props, ctx }) => (
    <Form
      component={props}
      disabled={ctx.disabled}
      onSubmitEvent={(event) => ctx.dispatch({ event })}
    />
  ),
};

export const SUPPORTED_COMPONENTS = COMPONENT_NAMES_V2.filter((name) => name in REGISTRY);
export const clientCapabilities = () => ({ platform: 'mobile', catalogId: CATALOG_ID, components: SUPPORTED_COMPONENTS });

// ---------- runtime → React ----------

export function useSurfaceVersion(store, surfaceId) {
  return useSyncExternalStore(
    (notify) => store.subscribe((change) => {
      if (!change.surfaceId || change.surfaceId === surfaceId || change.type === 'reset') notify();
    }),
    () => store.get(surfaceId)?.version ?? -1,
    () => store.get(surfaceId)?.version ?? -1,
  );
}

function Node({ store, surfaceId, id, scope, onAction, disabled }) {
  const component = store.getComponent(surfaceId, id);
  if (!component) return null;
  const Impl = REGISTRY[component.component];
  if (!Impl) return null;
  const props = store.resolve(surfaceId, component, { scope });
  if (props.hidden === true || props.visible === false) return null;

  // Ruta a la que escribe un control (value: {path}), ya absoluta.
  const binding = isObject(component.value) && typeof component.value.path === 'string' ? component.value.path : null;
  const writePath = binding ? (binding.startsWith('/') ? binding : `${scope}/${binding}`) : null;

  const renderChild = (childId, childScope) => (
    <Node key={`${childId}@${childScope}`} store={store} surfaceId={surfaceId} id={childId} scope={childScope} onAction={onAction} disabled={disabled} />
  );
  const ctx = {
    raw: component,
    scope,
    disabled,
    children: () => store.childIds(component).filter(() => component.component !== 'Tabs').map((childId) => renderChild(childId, scope)),
    rows: () => store.listRows(surfaceId, component, { scope }),
    renderChild,
    setData: (value) => { if (writePath) store.setData(surfaceId, writePath, value); },
    dispatch: (action) => {
      const result = store.dispatchAction(surfaceId, action, { scope });
      if (result?.kind === 'event') onAction?.(result.payload);
      return result;
    },
  };
  return <Impl props={props} ctx={ctx} />;
}

export default function A2UIRenderer({ store = surfaceStore, surfaceId, onAction, disabled = false, style }) {
  useSurfaceVersion(store, surfaceId);
  if (!surfaceId || !store.getComponent(surfaceId, ROOT_ID)) return null;
  return (
    <View style={style}>
      <Node store={store} surfaceId={surfaceId} id={ROOT_ID} scope="" onAction={onAction} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  rowItem: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  kpi: { gap: 4, paddingVertical: space.md },
  kpiLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  skeleton: { height: 44, borderRadius: radius.md, backgroundColor: color.surface3 },
});

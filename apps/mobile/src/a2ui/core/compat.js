// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Puente entre Norte UI Spec v1 (arreglo plano de `type`) y Norte A2UI v2.
//
// Hacia adelante (`liftV1Component`, `surfaceFromV1`): lo que ya está guardado
// en el historial, y lo que un modelo conservador siga emitiendo, se eleva a
// una superficie v2 sin perder nada. Hacia atrás (`toV1Components`): una
// superficie v2 se proyecta a v1 para los clientes que todavía no migraron y
// para las miniaturas del historial. Esa proyección resuelve los bindings, así
// que devuelve valores literales.

import { resolveProps } from './binding.js';
import { RENDERER_FUNCTIONS } from './functions.js';
import { buildPointer, getAt, parsePointer } from './pointer.js';
import { flattenTree } from './flatten.js';

export const V1_TYPES = [
  'header', 'kpi_grid', 'balance_cards', 'chart', 'table',
  'transaction_list', 'form', 'alert', 'progress', 'text',
];

export const isV1Type = (type) => V1_TYPES.includes(String(type ?? '').toLowerCase());

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : []);

// v1 → nodo v2 anidado (sin ids; los pone flattenTree).
export function liftV1Component(component) {
  if (!isObject(component)) return null;
  const { type, ...props } = component;
  switch (String(type).toLowerCase()) {
    case 'header':
      return { component: 'Header', ...props };
    case 'kpi_grid': {
      const items = list(props.items);
      return {
        component: 'Grid',
        columns: Math.max(2, Math.min(4, items.length || 2)),
        children: items.map((item) => ({ component: 'Kpi', ...item })),
      };
    }
    case 'balance_cards': {
      const accounts = list(props.accounts);
      return { component: 'Row', wrap: true, children: accounts.map((a) => ({ component: 'AccountCard', ...a })) };
    }
    case 'chart':
      return { component: 'Chart', ...props };
    case 'table':
      return { component: 'Table', ...props };
    case 'transaction_list':
      return { component: 'TransactionList', ...props };
    case 'form':
      return { component: 'Form', ...props };
    case 'alert':
      return { component: 'Alert', ...props };
    case 'progress':
      return { component: 'Progress', ...props };
    case 'text':
      return { component: 'Text', ...props };
    default:
      return null;
  }
}

// Una superficie v2 completa a partir de un `ui` v1 (historial viejo, clientes
// o modelos que sigan hablando v1).
export function surfaceFromV1(ui, { surfaceId = 'legacy', catalogId = 'urn:norte:a2ui:catalog:banorte:v2' } = {}) {
  const lifted = (Array.isArray(ui) ? ui : []).map(liftV1Component).filter(Boolean);
  const { components } = flattenTree(lifted);
  return { surfaceId, catalogId, sendDataModel: true, components, dataModel: {} };
}

// ---------- v2 → v1 ----------

const V2_LEAF_TO_V1 = {
  Header: 'header',
  Chart: 'chart',
  Table: 'table',
  TransactionList: 'transaction_list',
  Form: 'form',
  Alert: 'alert',
  Progress: 'progress',
  Text: 'text',
};

const strip = (component) => {
  const { id, component: _name, catalogId, children, child, items, template, action, ...props } = component;
  return props;
};

const bold = (text) => (text ? { type: 'text', markdown: `**${String(text)}**` } : null);

function describeInput(resolved) {
  const value = resolved.value;
  const shown =
    Array.isArray(resolved.options)
      ? (resolved.options.find((o) => isObject(o) && o.value == value)?.label ?? value)
      : value;
  const suffix = resolved.unit ? ` ${resolved.unit}` : '';
  return { type: 'text', markdown: `**${resolved.label ?? ''}:** ${shown ?? ''}${suffix}`.trim() };
}

// Proyecta una superficie a componentes v1. Los Kpi/AccountCard consecutivos
// se agrupan en un kpi_grid/balance_cards, que es como v1 los conocía.
export function toV1Components({ components = [], dataModel = {}, rootId = 'root' } = {}, { functions = RENDERER_FUNCTIONS } = {}) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const out = [];
  let run = null; // { kind: 'kpi'|'acct', items: [] }

  const flush = () => {
    if (!run) return;
    if (run.kind === 'kpi') out.push({ type: 'kpi_grid', items: run.items });
    else out.push({ type: 'balance_cards', accounts: run.items });
    run = null;
  };
  const pushRun = (kind, item) => {
    if (!run || run.kind !== kind) {
      flush();
      run = { kind, items: [] };
    }
    run.items.push(item);
  };

  const visit = (id, scope, depth) => {
    const component = byId.get(id);
    if (!component || depth > 32) return;
    const resolved = resolveProps(component, { model: dataModel, scope, functions });
    const name = component.component;

    if (name === 'Kpi') return pushRun('kpi', strip(resolved));
    if (name === 'AccountCard') return pushRun('acct', strip(resolved));
    flush();

    if (V2_LEAF_TO_V1[name]) {
      out.push({ type: V2_LEAF_TO_V1[name], ...strip(resolved) });
      return;
    }
    if (['Slider', 'Select', 'ChoiceChips', 'TextField', 'Toggle'].includes(name)) {
      out.push(describeInput(resolved));
      return;
    }
    if (name === 'Section' || name === 'Card') {
      const title = bold(resolved.title);
      if (title) out.push(title);
    }
    if (name === 'Tabs' && Array.isArray(component.items)) {
      for (const tab of component.items) {
        const label = bold(tab?.label);
        if (label) out.push(label);
        if (typeof tab?.child === 'string') visit(tab.child, scope, depth + 1);
        flush();
      }
      return;
    }
    if (typeof component.child === 'string') visit(component.child, scope, depth + 1);
    const children = component.children;
    if (Array.isArray(children)) {
      for (const childId of children) if (typeof childId === 'string') visit(childId, scope, depth + 1);
    } else if (isObject(children) && typeof children.path === 'string' && typeof children.componentId === 'string') {
      const listPointer = children.path.startsWith('/') ? children.path : buildPointer([...parsePointer(scope), ...children.path.split('/')]);
      const items = component.itemsLiteral ?? getAt(dataModel, listPointer);
      const rows = Array.isArray(items) ? items : [];
      rows.forEach((_, index) => visit(children.componentId, `${listPointer}/${index}`, depth + 1));
    }
    flush();
  };

  visit(rootId, '', 0);
  flush();
  return out;
}

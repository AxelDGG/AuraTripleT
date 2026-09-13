// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Degradación de una superficie a lo que el cliente anunció que sabe pintar.
//
// La negociación de catálogo (docs/A2UI.md §8) tiene dos mitades. La primera es
// el prompt: al modelo solo se le ofrecen los componentes de ese cliente. Esta
// es la segunda, la que de verdad lo garantiza: aunque el modelo pida un
// Calendar porque lo leyó en un flujo, un cliente que no lo sabe pintar recibe
// la mejor equivalencia que sí conoce, nunca un hueco en blanco.
//
// Reglas:
//   - contenedor desconocido → Stack (los hijos se conservan)
//   - hoja desconocida       → la equivalencia de FALLBACKS, encadenando hasta
//                              encontrar una que el cliente soporte
//   - si nada aplica         → su título en Text, y solo si ni eso hay, se quita
//                              el nodo y se desengancha de su padre
//
// Una conversión solo se hace si los datos son literales: con bindings el valor
// vive en el cliente y no se puede reacomodar aquí, así que se baja un escalón
// más (normalmente a Text, que conserva el título y no miente). El `value` de un
// control es la excepción: es su ruta de escritura y viaja tal cual al destino.

import { containsBinding } from './binding.js';
import { CONTAINER_COMPONENTS, ROOT_ID, canonicalComponentName, supportedSet } from './catalog-v2.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (value === undefined || value === null ? '' : String(value));
const list = (value) => (Array.isArray(value) ? value : []);

// A qué se parece cada componente cuando el cliente no lo tiene. El orden de la
// cadena va de "casi lo mismo" a "al menos se lee".
const FALLBACKS = {
  DataTable: 'Table',
  Calendar: 'Table',
  TransactionList: 'Table',
  Chart: 'Table',
  Table: 'Text',
  AccountCard: 'Kpi',
  Kpi: 'Text',
  Header: 'Text',
  Alert: 'Text',
  Progress: 'Text',
  DatePicker: 'TextField',
  ChoiceChips: 'Select',
  Slider: 'Select',
  Toggle: 'Select',
  Select: 'TextField',
  TextField: 'Text',
  Button: 'Text',
  Form: 'Text',
  Divider: null,
};

const MAX_HOPS = 5;
const MAX_SLIDER_OPTIONS = 12;

// Props estructurales que nunca se copian a la conversión.
const strip = ({ id, component, catalogId, children, child, ...props }) => props;

// ¿Los datos de este componente se pueden reacomodar aquí? `value` se ignora a
// propósito: en un control es la ruta de escritura y viaja tal cual al destino.
function convertible(component) {
  const { value, ...rest } = strip(component);
  return !containsBinding(rest);
}

// ---------- conversiones ----------
//
// Cada una recibe las props del componente original y devuelve las del destino,
// o null si con esos datos la conversión no tiene sentido.

const CONVERTERS = {
  'DataTable→Table': (props) => {
    const columns = list(props.columns).map((c) => (isObject(c) ? asText(c.label ?? c.key) : asText(c)));
    const keys = list(props.columns).map((c, i) => (isObject(c) ? asText(c.key ?? c.field ?? i) : asText(c)));
    const rows = list(props.rows).map((row) => (isObject(row) ? keys.map((key) => row[key] ?? '') : list(row)));
    if (!columns.length || !rows.length) return null;
    return { title: props.title, columns, rows };
  },
  'Calendar→Table': (props) => {
    const events = list(props.events).filter(isObject);
    if (!events.length) return null;
    return {
      title: props.title ?? 'Agenda',
      columns: ['Fecha', 'Evento'],
      rows: events.map((e) => [asText(e.date), asText(e.label ?? e.summary)]),
    };
  },
  'TransactionList→Table': (props) => {
    const items = list(props.items).filter(isObject);
    if (!items.length) return null;
    return {
      title: props.title ?? 'Movimientos',
      columns: ['Fecha', 'Concepto', 'Monto'],
      rows: items.map((t) => [asText(t.date), asText(t.description), asText(t.amount)]),
    };
  },
  'Chart→Table': (props) => {
    const labels = list(props.labels).map(asText);
    const datasets = list(props.datasets).filter(isObject);
    if (!labels.length || !datasets.length) return null;
    return {
      title: props.title,
      columns: ['', ...datasets.map((d, i) => asText(d.label ?? `Serie ${i + 1}`))],
      rows: labels.map((label, i) => [label, ...datasets.map((d) => asText(list(d.data)[i] ?? ''))]),
    };
  },
  'Table→Text': (props) => ({ markdown: `**${asText(props.title ?? 'Tabla')}**` }),
  'AccountCard→Kpi': (props) => ({ label: asText(props.name ?? 'Cuenta'), value: props.balance ?? '', delta: props.number }),
  'Kpi→Text': (props) => ({ markdown: `**${asText(props.label)}:** ${asText(props.value)}` }),
  'Header→Text': (props) => ({ markdown: `**${asText(props.title)}**${props.subtitle ? ` — ${asText(props.subtitle)}` : ''}` }),
  'Alert→Text': (props) => ({ markdown: `**${asText(props.title ?? 'Aviso')}** ${asText(props.text)}`.trim() }),
  'Progress→Text': (props) => ({ markdown: `**${asText(props.label)}:** ${asText(props.value)}%` }),
  'DatePicker→TextField': (props) => ({ label: props.label, value: props.value, inputType: 'text', placeholder: 'AAAA-MM-DD' }),
  'ChoiceChips→Select': (props) => ({ label: props.label, value: props.value, options: list(props.options) }),
  'Slider→Select': (props) => {
    const min = Number(props.min);
    const max = Number(props.max);
    const step = Number(props.step) > 0 ? Number(props.step) : 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    if ((max - min) / step + 1 > MAX_SLIDER_OPTIONS) return null;
    const options = [];
    for (let v = min; v <= max; v += step) options.push({ value: v, label: `${v}${props.unit ? ` ${props.unit}` : ''}` });
    return { label: props.label, value: props.value, options };
  },
  'Toggle→Select': (props) => ({
    label: props.label,
    value: props.value,
    options: [{ value: true, label: 'Sí' }, { value: false, label: 'No' }],
  }),
  'Select→TextField': (props) => ({ label: props.label, value: props.value, inputType: 'text' }),
  'TextField→Text': (props) => ({ markdown: `**${asText(props.label)}:** ${asText(props.value)}` }),
  'Button→Text': (props) => ({ markdown: `**${asText(props.label ?? 'Acción')}** (no disponible en este dispositivo)` }),
  'Form→Text': (props) => ({ markdown: `**${asText(props.title ?? 'Formulario')}** (no disponible en este dispositivo)` }),
};

// Controles: entre ellos el binding de escritura viaja tal cual.
const CONTROL_TARGETS = new Set(['Slider', 'Select', 'ChoiceChips', 'TextField', 'Toggle', 'DatePicker']);

// Un componente convertido conserva su id y su value (el binding de escritura
// sigue siendo válido en el destino cuando los dos son controles).
function convert(component, target) {
  const converter = CONVERTERS[`${component.component}→${target}`];
  if (!converter) return null;
  const props = converter(strip(component));
  if (!props) return null;
  const next = { id: component.id, component: target };
  for (const [key, value] of Object.entries(props)) if (value !== undefined) next[key] = value;
  if (component.value !== undefined && next.value === undefined && CONTROL_TARGETS.has(target)) next.value = component.value;
  return next;
}

// Cuando ninguna conversión aplica (props con bindings, datos vacíos), al menos
// se conserva de qué hablaba el bloque.
function genericText(component) {
  const props = strip(component);
  const label = [props.title, props.label, props.name, props.text]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean);
  return { id: component.id, component: 'Text', markdown: label ? `**${label}**` : '' };
}

// Tabs pierde las pestañas pero no su contenido: los hijos de cada una se
// apilan en el orden en que venían.
function containerToStack(component) {
  const next = { id: component.id, component: 'Stack' };
  if (component.component === 'Tabs' && Array.isArray(component.items)) {
    next.children = component.items.filter((t) => isObject(t) && typeof t.child === 'string').map((t) => t.child);
  } else if (component.children !== undefined) {
    next.children = component.children;
  } else if (typeof component.child === 'string') {
    next.children = [component.child];
  }
  if (component.itemsLiteral !== undefined) next.itemsLiteral = component.itemsLiteral;
  return next;
}

/**
 * Adapta los componentes de una superficie al catálogo del cliente.
 * @returns {{components: Array, notes: Array<{id: string, from: string, to: string|null}>}}
 */
export function degradeComponents(components, clientComponents) {
  const supported = supportedSet(clientComponents);
  if (!supported || !Array.isArray(components)) return { components: components ?? [], notes: [] };

  const notes = [];
  const out = [];
  for (const component of components) {
    const name = canonicalComponentName(component?.component);
    if (!name || supported.has(name)) {
      out.push(component);
      continue;
    }

    if (CONTAINER_COMPONENTS.has(name) && supported.has('Stack')) {
      out.push(containerToStack(component));
      notes.push({ id: component.id, from: name, to: 'Stack' });
      continue;
    }

    // Componentes puramente decorativos: se van sin dejar nada en su lugar.
    if (FALLBACKS[name] === null) {
      notes.push({ id: component.id, from: name, to: null });
      continue;
    }

    // Cadena de equivalencias: DataTable → Table → Text.
    let current = { ...component, component: name };
    let converted = null;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const target = FALLBACKS[current.component];
      if (!target) break;
      const candidate = convertible(current) ? convert(current, target) : null;
      if (!candidate) break;
      current = candidate;
      if (supported.has(target)) {
        converted = candidate;
        break;
      }
    }
    // Último recurso: el título en texto. Peor es que el bloque desaparezca sin
    // dejar rastro de qué iba ahí.
    if (!converted && supported.has('Text')) {
      const text = genericText(component);
      if (text.markdown) converted = text;
    }

    if (converted) {
      out.push(converted);
      notes.push({ id: component.id, from: name, to: converted.component });
    } else {
      notes.push({ id: component.id, from: name, to: null });
    }
  }

  // Los ids que desaparecieron se desenganchan de sus padres.
  const known = new Set(out.map((c) => c.id));
  const clean = out.map((component) => {
    const next = { ...component };
    if (Array.isArray(next.children)) next.children = next.children.filter((id) => known.has(id));
    if (typeof next.child === 'string' && !known.has(next.child)) delete next.child;
    if (next.component === 'Tabs' && Array.isArray(next.items)) next.items = next.items.filter((t) => isObject(t) && known.has(t.child));
    return next;
  });

  // Sin raíz no hay superficie: si se perdió, se repone vacía.
  if (!known.has(ROOT_ID) && clean.length) clean.unshift({ id: ROOT_ID, component: 'Stack', children: clean.map((c) => c.id) });
  return { components: clean, notes };
}

// Qué componentes de la superficie no sabe pintar este cliente (tests y logs).
export function unsupportedComponents(components, clientComponents) {
  const supported = supportedSet(clientComponents);
  if (!supported) return [];
  return [...new Set(list(components).map((c) => canonicalComponentName(c?.component)).filter(Boolean))]
    .filter((name) => !supported.has(name));
}

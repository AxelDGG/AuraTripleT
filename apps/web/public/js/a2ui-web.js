// Renderer web de Norte A2UI v2.
//
// Consume el runtime compartido (/a2ui/*.js, el mismo código que corre en la
// API y en la app móvil) y pone encima el registro de componentes en DOM. Lo
// que lo distingue del renderer v1 (renderer.js, que se queda para las
// miniaturas del historial):
//
//   - No repinta el lienzo completo: cada componente montado recuerda qué rutas
//     del dataModel leyó y solo él vuelve a dibujarse cuando alguna cambia.
//   - Un componente cuyo hijo todavía no llegó deja un hueco y se completa solo
//     cuando el chunk siguiente lo trae (la pantalla se arma en vivo).
//   - Los controles escriben en el dataModel; los botones arman su evento con
//     el contexto resuelto y lo entregan a `onAction`.
//
// Seguridad: igual que en v1, todo se construye con createElement/textContent.
// Nunca se interpreta HTML ni se ejecuta nada que venga del modelo: las
// funciones de binding y las acciones locales son tablas cerradas del runtime.

import {
  CATALOG_ID,
  COMPONENT_NAMES_V2,
  ROOT_ID,
  createSurfaceStore,
  formatCurrency,
  formatDate,
  joinPointer,
  pointersOverlap,
} from '/a2ui/index.js';

const CATEGORY_ICONS = {
  ingresos: 'catIncome', supermercado: 'catCart', restaurantes: 'catFood', entretenimiento: 'catPlay',
  servicios: 'catBolt', transporte: 'catCar', compras: 'catBag', salud: 'catHealth', hogar: 'catHome',
  vivienda: 'catBuilding', ahorro: 'catSavings', transferencias: 'catTransfer', 'pagos tdc': 'catCard',
};
const ALERT_ICONS = { info: 'alertInfo', success: 'alertSuccess', warning: 'alertWarning', error: 'alertError' };
const STAGGER_MS = 70;
const CONFIRM_WINDOW_MS = 6000;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

// Ícono SVG del set de la app (icons.js) metido en un contenedor.
function iconEl(className, name) {
  const node = el('div', className);
  node.innerHTML = window.ICONS.icon(name);
  return node;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asText = (v) => (v === undefined || v === null ? '' : String(v));
// Un valor numérico en un lugar de texto se lee como pesos: es lo que casi
// siempre significa en una interfaz bancaria (y lo que el modelo olvida formatear).
const moneyOrText = (v) => (typeof v === 'number' ? formatCurrency(v) : asText(v));

// Mini-markdown seguro: **negritas** y `código`.
function renderMarkdown(target, md) {
  const parts = asText(md).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) target.appendChild(el('strong', null, part.slice(2, -2)));
    else if (part.startsWith('`') && part.endsWith('`')) target.appendChild(el('code', null, part.slice(1, -1)));
    else if (part) target.appendChild(document.createTextNode(part));
  }
}

// Ruta absoluta a la que escribe un control (`value: {path}`), o null.
function boundPath(raw, scope) {
  const binding = raw?.value;
  if (!isObject(binding) || typeof binding.path !== 'string') return null;
  return joinPointer(scope, binding.path);
}

// Opciones {value,label} a partir de lo que mande el modelo.
function options(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => (isObject(o) ? { value: o.value, label: asText(o.label ?? o.value) } : { value: o, label: asText(o) }));
}

// ---------- registro de componentes ----------
//
// Cada función recibe (props resueltas, ctx) y devuelve un nodo. `ctx` trae:
//   raw          el componente sin resolver (para leer bindings de escritura)
//   scope        puntero base (dentro de un List)
//   children()   nodos de los hijos, ya montados
//   rows()       filas de un List [{scope, componentId}]
//   renderChild(id, scope)
//   setData(path, value)   escribe en el dataModel (origen = este componente)
//   dispatch(action)       ejecuta la acción del componente
//   ui           estado local de UI que sobrevive a re-renders (pestaña activa)

const COMPONENTS = {
  // ---------- layout ----------
  Stack(props, ctx) {
    const node = el('div', `a2-stack gap-${['sm', 'md', 'lg'].includes(props.gap) ? props.gap : 'md'}`);
    node.append(...ctx.children());
    return node;
  },
  Row(props, ctx) {
    const node = el('div', `a2-row${props.wrap === false ? '' : ' wrap'}${props.align === 'center' ? ' center' : ''}`);
    node.append(...ctx.children());
    return node;
  },
  Grid(props, ctx) {
    const node = el('div', 'a2-grid');
    const cols = Math.max(1, Math.min(4, Number(props.columns) || Math.min(4, Math.max(2, ctx.childIds().length))));
    node.style.setProperty('--cols', String(cols));
    node.append(...ctx.children());
    return node;
  },
  Card(props, ctx) {
    const node = el('div', 'card gen a2-card');
    if (props.title) node.append(el('h3', null, props.title));
    if (props.subtitle) node.append(el('p', 'ch-sub', props.subtitle));
    const body = el('div', 'a2-stack gap-md');
    body.append(...ctx.children());
    node.append(body);
    return node;
  },
  Section(props, ctx) {
    const node = el('section', 'a2-section gen');
    if (props.title || props.subtitle) {
      const head = el('div', 'a2-section-head');
      if (props.title) head.append(el('h2', null, props.title));
      if (props.subtitle) head.append(el('p', null, props.subtitle));
      node.append(head);
    }
    const body = el('div', 'a2-stack gap-md');
    body.append(...ctx.children());
    node.append(body);
    return node;
  },
  Tabs(props, ctx) {
    const node = el('div', 'a2-tabs gen');
    const items = Array.isArray(ctx.raw.items) ? ctx.raw.items.filter((t) => isObject(t) && typeof t.child === 'string') : [];
    if (!items.length) return node;
    const active = Math.min(ctx.ui.tab ?? 0, items.length - 1);
    const list = el('div', 'a2-tablist');
    list.setAttribute('role', 'tablist');
    const panel = el('div', 'a2-tabpanel');
    items.forEach((tab, index) => {
      const button = el('button', `a2-tab${index === active ? ' is-active' : ''}`, asText(tab.label));
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === active));
      button.addEventListener('click', () => {
        ctx.ui.tab = index;
        ctx.rerender();
      });
      list.append(button);
    });
    panel.append(ctx.renderChild(items[active].child, ctx.scope));
    node.append(list, panel);
    return node;
  },
  Divider() {
    return el('hr', 'a2-divider');
  },
  List(props, ctx) {
    const node = el('div', 'a2-list gen');
    if (props.title) node.append(el('h3', null, props.title));
    const rows = ctx.rows();
    if (!rows.length) {
      node.append(el('p', 'a2-empty', props.emptyText ?? 'Sin elementos.'));
      return node;
    }
    for (const row of rows) node.append(ctx.renderChild(row.componentId, row.scope));
    return node;
  },

  // ---------- dominio ----------
  Header(props) {
    const wrap = el('div', 'c-header gen');
    if (props.badge) wrap.append(el('span', 'badge', props.badge));
    wrap.append(el('h1', null, asText(props.title)));
    if (props.subtitle) wrap.append(el('p', null, props.subtitle));
    return wrap;
  },
  Kpi(props) {
    const kpi = el('div', 'kpi gen');
    const label = el('div', 'k-label');
    if (props.icon) label.append(el('span', null, props.icon));
    label.append(el('span', null, asText(props.label)));
    kpi.append(label, el('div', 'k-value', moneyOrText(props.value)));
    if (props.delta) {
      const trend = ['up', 'down', 'neutral'].includes(props.trend) ? props.trend : 'neutral';
      kpi.append(el('div', `k-delta ${trend}`, props.delta));
    }
    return kpi;
  },
  AccountCard(props) {
    const kind = ['checking', 'savings', 'credit'].includes(props.kind) ? props.kind : 'checking';
    const card = el('div', `acct gen ${kind}`);
    const top = el('div');
    top.append(el('div', 'a-name', props.name ?? 'Cuenta'));
    if (props.number) top.append(el('div', 'a-num', props.number));
    const bottom = el('div');
    bottom.append(el('div', 'a-bal', typeof props.balance === 'number' ? formatCurrency(props.balance) : asText(props.balance)));
    if (props.extra) bottom.append(el('div', 'a-extra', props.extra));
    card.append(top, bottom);
    return card;
  },
  Chart(props, ctx) {
    const spec = { ...props, type: 'chart', labels: Array.isArray(props.labels) ? props.labels : [], datasets: Array.isArray(props.datasets) ? props.datasets : [] };

    // Cambió el dataModel (un slider, un patch) y la gráfica ya existe: se
    // actualizan los datos en su lugar en vez de recrear el canvas. Sin esto
    // cada tick del slider reiniciaba la animación y dejaba instancias de
    // Chart.js huérfanas.
    const previous = ctx.previousNode;
    const existing = previous?.querySelector('canvas') && window.Chart?.getChart?.(previous.querySelector('canvas'));
    if (existing && previous.dataset.chartType === String(spec.chartType)) {
      try {
        existing.data.labels = spec.labels;
        spec.datasets.forEach((dataset, i) => {
          if (existing.data.datasets[i]) {
            existing.data.datasets[i].data = Array.isArray(dataset.data) ? dataset.data : [];
            if (dataset.label !== undefined) existing.data.datasets[i].label = dataset.label;
          }
        });
        existing.update();
        const title = previous.querySelector('h3');
        if (title && props.title) title.textContent = props.title;
        return previous;
      } catch (err) {
        console.error('[a2ui] no se pudo actualizar la gráfica en sitio', err);
      }
    }

    const card = el('div', 'card c-chart gen');
    card.dataset.chartType = String(spec.chartType);
    if (props.title) card.append(el('h3', null, props.title));
    if (props.subtitle) card.append(el('p', 'ch-sub', props.subtitle));
    if (window.NorteCharts) {
      try {
        card.append(window.NorteCharts.create(spec));
      } catch (err) {
        console.error('[a2ui] gráfica', err);
        card.append(el('p', 'ch-sub', 'No se pudo dibujar la gráfica.'));
      }
    } else {
      card.append(el('p', 'ch-sub', 'No se pudo cargar el motor de gráficas.'));
    }
    if (props.caption) card.append(el('div', 'ch-cap', props.caption));
    return card;
  },
  Table(props) {
    const card = el('div', 'card c-table gen');
    if (props.title) card.append(el('h3', null, props.title));
    const table = el('table');
    const thead = el('thead');
    const headRow = el('tr');
    for (const col of Array.isArray(props.columns) ? props.columns : []) headRow.append(el('th', null, asText(col)));
    thead.append(headRow);
    const tbody = el('tbody');
    for (const row of Array.isArray(props.rows) ? props.rows : []) {
      const tr = el('tr');
      for (const cell of Array.isArray(row) ? row : [row]) tr.append(el('td', null, moneyOrText(cell)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    card.append(table);
    return card;
  },
  TransactionList(props) {
    const card = el('div', 'card gen');
    if (props.title) card.append(el('h3', null, props.title));
    for (const t of Array.isArray(props.items) ? props.items.filter(isObject) : []) {
      const row = el('div', 'tx');
      row.append(iconEl('t-icon', CATEGORY_ICONS[asText(t.category).toLowerCase()] ?? 'catMoney'));
      const main = el('div', 't-main');
      main.append(el('div', 't-desc', asText(t.description)));
      main.append(el('div', 't-meta', [t.date ? formatDate(t.date) : '', t.category].filter(Boolean).join(' · ')));
      const amount = Number(t.amount ?? 0);
      row.append(main, el('div', `t-amt ${amount >= 0 ? 'pos' : 'neg'}`, `${amount >= 0 ? '+' : ''}${formatCurrency(amount)}`));
      card.append(row);
    }
    return card;
  },
  Alert(props) {
    const level = ['info', 'success', 'warning', 'error'].includes(props.level) ? props.level : 'info';
    const wrap = el('div', `c-alert ${level} gen`);
    wrap.append(iconEl('al-icon', ALERT_ICONS[level]));
    const body = el('div');
    if (props.title) body.append(el('b', null, props.title));
    body.append(el('span', null, asText(props.text)));
    wrap.append(body);
    return wrap;
  },
  Progress(props) {
    const card = el('div', 'card c-progress gen');
    const value = Math.max(0, Math.min(100, Number(props.value ?? 0)));
    const head = el('div', 'p-head');
    head.append(el('span', null, asText(props.label)), el('span', null, `${Math.round(value)}%`));
    const track = el('div', 'p-track');
    const fill = el('div', 'p-fill');
    fill.style.width = '0%';
    track.append(fill);
    card.append(head, track);
    if (props.caption) card.append(el('div', 'p-cap', props.caption));
    requestAnimationFrame(() => { fill.style.width = `${value}%`; });
    return card;
  },
  Text(props) {
    const card = el('div', 'card c-text gen');
    renderMarkdown(card, props.markdown ?? props.text ?? '');
    return card;
  },
  Skeleton(props) {
    const variant = ['header', 'chart', 'cards', 'kpis', 'list', 'form', 'plan', 'text'].includes(props.variant) ? props.variant : 'text';
    const node = el('div', `a2-skeleton is-${variant}`);
    const blocks = { header: 2, chart: 1, cards: 3, kpis: 3, list: 4, form: 3, plan: 4, text: 2 }[variant];
    for (let i = 0; i < blocks; i++) node.append(el('span', 'skeleton'));
    return node;
  },

  // ---------- controles ----------
  Slider(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const card = el('div', 'card gen a2-control a2-slider');
    const head = el('div', 'a2-control-head');
    head.append(el('label', null, asText(props.label)));
    const readout = el('span', 'a2-readout');
    head.append(readout);
    const input = el('input');
    input.type = 'range';
    const min = Number.isFinite(Number(props.min)) ? Number(props.min) : 0;
    const max = Number.isFinite(Number(props.max)) ? Number(props.max) : 100;
    const step = Number(props.step) > 0 ? Number(props.step) : 1;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const current = Number(props.value);
    input.value = String(Number.isFinite(current) ? current : min);
    const show = (v) => { readout.textContent = `${props.format === 'currency' ? formatCurrency(v) : v}${props.unit ? ` ${props.unit}` : ''}`; };
    show(Number(input.value));
    input.addEventListener('input', () => {
      show(Number(input.value));
      if (path) ctx.setData(path, Number(input.value));
    });
    const scale = el('div', 'a2-scale');
    scale.append(el('span', null, `${min}${props.unit ? ` ${props.unit}` : ''}`), el('span', null, `${max}${props.unit ? ` ${props.unit}` : ''}`));
    card.append(head, input, scale);
    if (props.hint) card.append(el('div', 'p-cap', props.hint));
    return card;
  },
  Select(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const field = el('div', 'f-field gen a2-control');
    field.append(el('label', null, asText(props.label)));
    const select = el('select');
    const opts = options(props.options);
    for (const o of opts) {
      const option = el('option', null, o.label);
      option.value = asText(o.value);
      if (o.value == props.value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const chosen = opts.find((o) => asText(o.value) === select.value);
      if (path) ctx.setData(path, chosen ? chosen.value : select.value);
    });
    field.append(select);
    return field;
  },
  ChoiceChips(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const wrap = el('div', 'a2-control gen a2-chips-wrap');
    if (props.label) wrap.append(el('label', 'a2-control-label', props.label));
    const chips = el('div', 'a2-chips');
    chips.setAttribute('role', 'radiogroup');
    for (const o of options(props.options)) {
      const chip = el('button', `a2-chip${o.value == props.value ? ' is-active' : ''}`, o.label);
      chip.type = 'button';
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(o.value == props.value));
      chip.addEventListener('click', () => {
        if (path) ctx.setData(path, o.value, { rerenderSelf: true });
      });
      chips.append(chip);
    }
    wrap.append(chips);
    return wrap;
  },
  TextField(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const field = el('div', 'f-field gen a2-control');
    field.append(el('label', null, asText(props.label)));
    const input = el('input');
    const numeric = props.inputType === 'number';
    input.type = numeric ? 'number' : 'text';
    if (numeric) { input.step = 'any'; }
    if (props.placeholder) input.placeholder = props.placeholder;
    input.value = asText(props.value);
    input.addEventListener('input', () => {
      if (!path) return;
      ctx.setData(path, numeric ? (input.value === '' ? '' : Number(input.value)) : input.value);
    });
    field.append(input);
    return field;
  },
  Toggle(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const wrap = el('label', 'a2-toggle gen');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = props.value === true || props.value === 'true';
    input.addEventListener('change', () => { if (path) ctx.setData(path, input.checked, { rerenderSelf: true }); });
    wrap.append(input, el('span', 'a2-toggle-track'), el('span', 'a2-toggle-label', asText(props.label)));
    return wrap;
  },

  // ---------- acciones ----------
  Button(props, ctx) {
    const variant = ['primary', 'secondary', 'ghost', 'danger'].includes(props.variant) ? props.variant : 'primary';
    const button = el('button', `a2-btn ${variant} gen`, asText(props.label ?? 'Continuar'));
    button.type = 'button';
    if (props.icon) button.prepend(el('span', 'a2-btn-icon', props.icon));
    let armed = false;
    let timer = null;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      if (props.confirm && !armed) {
        armed = true;
        button.classList.add('is-armed');
        button.textContent = `¿Confirmar? ${asText(props.label)}`;
        timer = setTimeout(() => { armed = false; button.classList.remove('is-armed'); button.textContent = asText(props.label); }, CONFIRM_WINDOW_MS);
        return;
      }
      clearTimeout(timer);
      ctx.dispatch(ctx.raw.action, button);
    });
    return button;
  },
  Form(props, ctx) {
    const card = el('div', 'card c-form gen');
    if (props.title) card.append(el('h3', null, props.title));
    if (props.description) card.append(el('p', 'f-desc', props.description));
    const form = el('form');
    const grid = el('div', 'f-grid');
    const fields = Array.isArray(props.fields) ? props.fields.filter(isObject) : [];
    const numeric = new Set();
    for (const f of fields) {
      const field = el('div', 'f-field');
      field.append(el('label', null, asText(f.label ?? f.name)));
      const opts = options(f.options);
      const kind = f.inputType ?? f.type ?? (opts.length ? 'select' : 'text');
      let input;
      if (kind === 'select') {
        input = el('select');
        for (const o of opts) {
          const option = el('option', null, o.label);
          option.value = asText(o.value);
          input.append(option);
        }
      } else {
        input = el('input');
        input.type = kind === 'number' ? 'number' : 'text';
        if (input.type === 'number') { input.step = 'any'; input.min = '0'; numeric.add(asText(f.name)); }
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.name = asText(f.name);
      if (f.value !== undefined && f.value !== null) input.value = asText(f.value);
      field.append(input);
      grid.append(field);
    }
    form.append(grid);
    const submit = el('button', 'f-submit', asText(props.submitLabel ?? 'Enviar'));
    submit.type = 'submit';
    form.append(submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const context = {};
      for (const [k, v] of new FormData(form).entries()) {
        const text = asText(v).trim();
        if (text === '') continue;
        context[k] = numeric.has(k) && Number.isFinite(Number(text)) ? Number(text) : text;
      }
      ctx.dispatch({ event: { name: asText(props.action ?? 'accion'), context } }, submit);
    });
    card.append(form);
    return card;
  },
};

export const SUPPORTED_COMPONENTS = COMPONENT_NAMES_V2.filter((name) => name in COMPONENTS);

// ---------- renderer ----------

export function createRenderer({ store, onAction }) {
  const mounts = new Set();

  function mount(container, surfaceId) {
    const entries = new Map(); // key → { id, scope, node, deps, parentKey, ui }
    const uiState = new Map(); // key → estado local (pestaña activa)
    let busy = false;
    let staggerIndex = 0;
    const keyOf = (id, scope) => `${id}@${scope}`;

    // Pasada de repintado en curso: qué ruta cambió (si fue un dato) y qué
    // entradas se tocaron, para reutilizar subárboles intactos y borrar el resto.
    let pass = null;

    function subtreeDependsOn(key, path) {
      for (const [k, e] of entries) {
        if (k !== key && !isDescendant(e, key)) continue;
        for (const dep of e.deps) if (pointersOverlap(path, dep)) return true;
      }
      return false;
    }

    function touchSubtree(key) {
      pass.touched.add(key);
      for (const [k, e] of entries) if (isDescendant(e, key)) pass.touched.add(k);
    }

    function render(id, scope, parentKey, { force = false } = {}) {
      const key = keyOf(id, scope);
      const component = store.getComponent(surfaceId, id);
      const previous = entries.get(key);
      // Un subárbol que no cambió (mismo componente, sin dependencias en la
      // ruta que cambió) se reutiliza tal cual: la gráfica de al lado no se
      // vuelve a dibujar porque llegó un hermano nuevo.
      if (
        pass && !force && previous && !previous.pending && previous.component === component &&
        previous.node.isConnected && !(pass.changedPath !== undefined && subtreeDependsOn(key, pass.changedPath))
      ) {
        touchSubtree(key);
        return previous.node;
      }
      if (!component) {
        // El hijo todavía no llegó: hueco que el chunk siguiente rellena.
        const placeholder = el('div', 'a2-pending');
        placeholder.dataset.id = id;
        entries.set(key, { id, scope, node: placeholder, deps: new Set(), parentKey, pending: true });
        pass?.touched.add(key);
        return placeholder;
      }
      const deps = new Set();
      const props = store.resolve(surfaceId, component, { scope, deps });
      const ui = uiState.get(key) ?? {};
      uiState.set(key, ui);
      const childIds = () => store.childIds(component).filter((childId) => !(component.component === 'Tabs'));
      const ctx = {
        raw: component,
        scope,
        ui,
        // Nodo anterior de este mismo componente (si se está repintando), para
        // que un componente pesado pueda actualizarse en sitio.
        previousNode: previous && !previous.pending ? previous.node : null,
        childIds,
        children: () => childIds().map((childId) => render(childId, scope, key)),
        rows: () => store.listRows(surfaceId, component, { scope }),
        renderChild: (childId, childScope) => render(childId, childScope, key),
        setData: (path, value, { rerenderSelf = false } = {}) => {
          store.setData(surfaceId, path, value, { origin: rerenderSelf ? null : key });
        },
        dispatch: (action, trigger) => dispatch(action, scope, trigger),
        rerender: () => rerenderEntry(key),
      };

      let node;
      const renderFn = COMPONENTS[component.component];
      const hidden = props.hidden === true || props.visible === false;
      if (!renderFn || hidden) {
        node = el('div', 'a2-hidden');
      } else {
        try {
          node = renderFn(props, ctx);
        } catch (err) {
          console.error('[a2ui] componente', component.component, err);
          node = COMPONENTS.Alert({ level: 'warning', text: `No se pudo dibujar ${component.component}.` }, ctx);
        }
      }
      node.dataset.a2ui = component.component;
      if (!previous || previous.pending) node.style.animationDelay = `${(staggerIndex++ % 8) * STAGGER_MS}ms`;
      if (busy) setBusyOn(node, true);
      entries.set(key, { id, scope, node, deps, parentKey, ui, component });
      pass?.touched.add(key);
      return node;
    }

    function rerenderEntry(key, { changedPath } = {}) {
      const entry = entries.get(key);
      if (!entry || !entry.node.isConnected) return;
      const outer = pass;
      pass = { changedPath, touched: new Set() };
      let next;
      try {
        next = render(entry.id, entry.scope, entry.parentKey, { force: true });
        // Los descendientes que no se tocaron ya no están en pantalla: se sueltan.
        for (const [k, e] of [...entries]) {
          if (isDescendant(e, key) && !pass.touched.has(k)) {
            destroyCharts(e.node);
            entries.delete(k);
          }
        }
      } finally {
        pass = outer;
      }
      if (next === entry.node) return; // se actualizó en sitio
      destroyCharts(entry.node);
      entry.node.replaceWith(next);
    }

    // Chart.js conserva cada instancia hasta que se destruye: al quitar un
    // nodo del DOM hay que soltar sus gráficas o se acumulan en memoria.
    function destroyCharts(node) {
      if (!window.Chart?.getChart) return;
      for (const canvas of node.querySelectorAll('canvas')) window.Chart.getChart(canvas)?.destroy();
    }

    function isDescendant(entry, ancestorKey) {
      let k = entry.parentKey;
      let guard = 0;
      while (k && guard++ < 64) {
        if (k === ancestorKey) return true;
        k = entries.get(k)?.parentKey;
      }
      return false;
    }

    // Quita de un conjunto de llaves las que tienen un ancestro en el mismo conjunto.
    function topmost(keys) {
      return [...keys].filter((key) => {
        const entry = entries.get(key);
        let k = entry?.parentKey;
        let guard = 0;
        while (k && guard++ < 64) {
          if (keys.has(k)) return false;
          k = entries.get(k)?.parentKey;
        }
        return true;
      });
    }

    function onComponents(ids) {
      const keys = new Set();
      for (const id of ids) {
        let found = false;
        for (const [key, entry] of entries) {
          if (entry.id === id) { keys.add(key); found = true; }
        }
        if (!found) {
          // Componente nuevo: se repinta el padre que lo referencia.
          for (const [key, entry] of entries) {
            const parent = store.getComponent(surfaceId, entry.id);
            if (parent && store.childIds(parent).includes(id)) keys.add(key);
          }
        }
      }
      if (!entries.size && store.getComponent(surfaceId, ROOT_ID)) {
        container.replaceChildren(render(ROOT_ID, '', null));
        return;
      }
      for (const key of topmost(keys)) rerenderEntry(key);
      // Huecos que ya pueden llenarse.
      for (const [key, entry] of [...entries]) {
        if (entry.pending && store.getComponent(surfaceId, entry.id)) rerenderEntry(key);
      }
    }

    function onData(path, origin) {
      const keys = new Set();
      for (const [key, entry] of entries) {
        if (key === origin) continue;
        for (const dep of entry.deps) {
          if (pointersOverlap(path, dep)) { keys.add(key); break; }
        }
      }
      for (const key of topmost(keys)) rerenderEntry(key, { changedPath: path });
    }

    function dispatch(action, scope, trigger) {
      if (busy) return;
      const result = store.dispatchAction(surfaceId, action, { scope });
      if (!result) return;
      if (result.kind === 'event') {
        if (trigger) { trigger.disabled = true; trigger.classList.add('is-sent'); }
        onAction?.(result.payload, { surfaceId, trigger });
      }
    }

    function setBusyOn(node, value) {
      for (const control of node.querySelectorAll('button, input, select')) {
        if (value) { if (!control.disabled) control.dataset.busyLock = '1'; control.disabled = true; }
        else if (control.dataset.busyLock) { control.disabled = false; delete control.dataset.busyLock; }
      }
    }

    const unsubscribe = store.subscribe((change) => {
      if (change.surfaceId !== surfaceId) return;
      if (change.type === 'createSurface') {
        entries.clear();
        uiState.clear();
        container.replaceChildren(render(ROOT_ID, '', null));
      } else if (change.type === 'updateComponents') {
        onComponents(change.componentIds ?? []);
      } else if (change.type === 'updateDataModel') {
        onData(change.path ?? '', change.origin ?? null);
      } else if (change.type === 'deleteSurface') {
        destroyCharts(container);
        container.replaceChildren();
        entries.clear();
      }
    });

    if (store.getComponent(surfaceId, ROOT_ID)) container.replaceChildren(render(ROOT_ID, '', null));

    const handle = {
      surfaceId,
      container,
      setBusy(value) {
        busy = Boolean(value);
        setBusyOn(container, busy);
      },
      unmount() {
        unsubscribe();
        mounts.delete(handle);
        destroyCharts(container);
        entries.clear();
      },
    };
    mounts.add(handle);
    return handle;
  }

  return { mount, mounts, components: COMPONENTS };
}

// ---------- instancia global de la web ----------

const store = createSurfaceStore();
let actionHandler = null;
const renderer = createRenderer({ store, onAction: (payload, meta) => actionHandler?.(payload, meta) });

// Carga una superficie completa (del historial o de un evento `ui`) en el store.
function loadSurface(surface) {
  if (!surface?.surfaceId) return null;
  store.apply({ version: 'v1.0', createSurface: surface });
  return surface.surfaceId;
}

window.A2UIWeb = {
  store,
  renderer,
  loadSurface,
  applyMessage: (message) => store.apply(message),
  mount: (container, surfaceId) => renderer.mount(container, surfaceId),
  onAction: (handler) => { actionHandler = handler; },
  supportedComponents: () => SUPPORTED_COMPONENTS,
  capabilities: () => ({ platform: 'web', catalogId: CATALOG_ID, components: SUPPORTED_COMPONENTS }),
  // Superficie activa para el agente: id, título y modelo de datos actual.
  activeSurface(surfaceId, title) {
    const surface = store.get(surfaceId);
    return surface ? { surfaceId, title, dataModel: surface.dataModel } : null;
  },
};

window.dispatchEvent(new CustomEvent('a2ui:ready'));

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

// ---------- fechas ----------
//
// Las fechas "YYYY-MM-DD" se parsean a mano a propósito: new Date("2026-09-15")
// se interpreta en UTC y en México se corre un día hacia atrás.

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const EVENT_KINDS = ['payment', 'due', 'personal', 'info'];

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asText(value));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// "2026-09" o "2026-09-15" → primer día de ese mes.
function parseMonth(value) {
  const match = /^(\d{4})-(\d{2})/.exec(asText(value));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

// Semanas de lunes a domingo que cubren el mes, incluyendo los días de relleno.
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

function eventsByDate(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list.filter(isObject) : []) {
    const iso = toISODate(parseISODate(item.date));
    if (!iso) continue;
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso).push(item);
  }
  return map;
}

const eventKind = (item) => (EVENT_KINDS.includes(item?.kind) ? item.kind : 'info');

// Estados frecuentes de un pago/cita → color del badge. Lo que no reconoce se
// pinta neutro: el modelo escribe la etiqueta que quiera y nunca queda rota.
const BADGE_TONES = {
  ok: ['pagado', 'pagada', 'programado', 'programada', 'agendado', 'agendada', 'activo', 'activa', 'ok', 'success', 'completado', 'liquidado', 'al corriente'],
  warn: ['pendiente', 'por pagar', 'proximo', 'próximo', 'en riesgo', 'warning', 'parcial'],
  danger: ['vencido', 'vencida', 'atrasado', 'atrasada', 'rechazado', 'error', 'cancelado', 'cancelada'],
};

const deaccent = (v) => asText(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function badgeTone(value) {
  const text = deaccent(value);
  for (const [tone, words] of Object.entries(BADGE_TONES)) {
    if (words.some((w) => text.includes(deaccent(w)))) return tone;
  }
  return 'neutral';
}

// Celda de DataTable según el "format" de su columna.
function formatCell(value, format) {
  if (format === 'badge') return el('span', `dt-badge is-${badgeTone(value)}`, asText(value));
  if (format === 'currency') return document.createTextNode(typeof value === 'number' ? formatCurrency(value) : asText(value));
  if (format === 'date') return document.createTextNode(parseISODate(value) ? formatDate(value) : asText(value));
  if (format === 'percent') return document.createTextNode(Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : asText(value));
  if (format === 'number') return document.createTextNode(Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-MX') : asText(value));
  return document.createTextNode(moneyOrText(value));
}

// Rejilla de un mes, compartida por Calendar y DatePicker. `onPick` la vuelve
// seleccionable; sin él es solo lectura. El mes visible es estado local de UI.
function monthGrid({ monthStart, selectedIso, events, min, max, onPick, onMonth }) {
  const wrap = el('div', 'a2-cal');
  const head = el('div', 'a2-cal-head');
  const prev = el('button', 'a2-cal-nav', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Mes anterior');
  prev.addEventListener('click', () => onMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)));
  const next = el('button', 'a2-cal-nav', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Mes siguiente');
  next.addEventListener('click', () => onMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)));
  head.append(prev, el('div', 'a2-cal-month', `${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`), next);

  const week = el('div', 'a2-cal-week');
  for (const day of WEEKDAY_LABELS) week.append(el('span', null, day));

  const grid = el('div', 'a2-cal-grid');
  const todayIso = toISODate(new Date());
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);
  for (const cell of monthMatrix(monthStart)) {
    const dayEvents = events.get(cell.iso) ?? [];
    const disabled = (minDate && cell.date < minDate) || (maxDate && cell.date > maxDate);
    const classes = ['a2-cal-day'];
    if (!cell.inMonth) classes.push('is-outside');
    if (cell.iso === todayIso) classes.push('is-today');
    if (selectedIso && cell.iso === selectedIso) classes.push('is-selected');
    if (disabled) classes.push('is-disabled');
    const day = el(onPick && !disabled ? 'button' : 'div', classes.join(' '));
    if (onPick && !disabled) {
      day.type = 'button';
      day.addEventListener('click', () => onPick(cell.iso));
    }
    day.append(el('span', 'a2-cal-num', cell.date.getDate()));
    if (dayEvents.length) {
      const dots = el('span', 'a2-cal-dots');
      for (const item of dayEvents.slice(0, 3)) dots.append(el('span', `a2-cal-dot is-${eventKind(item)}`));
      day.append(dots);
      day.title = dayEvents.map((e) => asText(e.label)).filter(Boolean).join(' · ');
    }
    grid.append(day);
  }
  wrap.append(head, week, grid);
  return wrap;
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
  DataTable(props, ctx) {
    const card = el('div', 'card c-datatable gen');
    if (props.title) card.append(el('h3', null, props.title));
    if (props.subtitle) card.append(el('p', 'ch-sub', props.subtitle));

    const columns = (Array.isArray(props.columns) ? props.columns : []).map((c, i) =>
      (isObject(c) ? { key: asText(c.key ?? c.field ?? i), label: asText(c.label ?? c.key ?? c.field ?? ''), format: c.format, align: c.align } : { key: asText(c), label: asText(c), format: undefined, align: undefined }));
    const rows = (Array.isArray(props.rows) ? props.rows : []).map((r) =>
      (isObject(r) ? r : Object.fromEntries(columns.map((c, i) => [c.key, Array.isArray(r) ? r[i] : r]))));
    if (!columns.length || !rows.length) {
      card.append(el('p', 'a2-empty', props.emptyText ?? 'Sin datos que mostrar.'));
      return card;
    }

    const sort = ctx.ui.sort ?? null;
    const sorted = sort ? [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      const numeric = typeof x === 'number' && typeof y === 'number';
      const cmp = numeric ? x - y : asText(x).localeCompare(asText(y), 'es', { numeric: true });
      return sort.dir === 'desc' ? -cmp : cmp;
    }) : rows;

    const pageSize = Number(props.pageSize) > 0 ? Math.floor(Number(props.pageSize)) : 0;
    const pages = pageSize ? Math.ceil(sorted.length / pageSize) : 1;
    const page = Math.min(ctx.ui.page ?? 0, pages - 1);
    const visible = pageSize ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;

    const table = el('table');
    const headRow = el('tr');
    for (const col of columns) {
      const th = el('th', col.align === 'right' ? 'is-right' : null);
      const button = el('button', `dt-sort${sort?.key === col.key ? ` is-active is-${sort.dir}` : ''}`, col.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        ctx.ui.sort = sort?.key === col.key && sort.dir === 'asc' ? { key: col.key, dir: 'desc' } : { key: col.key, dir: 'asc' };
        ctx.ui.page = 0;
        ctx.rerender();
      });
      th.append(button);
      headRow.append(th);
    }
    const thead = el('thead');
    thead.append(headRow);

    const tbody = el('tbody');
    for (const row of visible) {
      const tr = el('tr');
      for (const col of columns) {
        const td = el('td', col.align === 'right' ? 'is-right' : null);
        td.append(formatCell(row[col.key], col.format));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    card.append(table);

    if (pages > 1) {
      const footer = el('div', 'dt-foot');
      const prev = el('button', 'dt-page', 'Anterior');
      prev.type = 'button';
      prev.disabled = page === 0;
      prev.addEventListener('click', () => { ctx.ui.page = page - 1; ctx.rerender(); });
      const next = el('button', 'dt-page', 'Siguiente');
      next.type = 'button';
      next.disabled = page >= pages - 1;
      next.addEventListener('click', () => { ctx.ui.page = page + 1; ctx.rerender(); });
      footer.append(prev, el('span', 'dt-count', `${page + 1} de ${pages} · ${sorted.length} filas`), next);
      card.append(footer);
    }
    if (props.caption) card.append(el('div', 'p-cap', props.caption));
    return card;
  },
  Calendar(props, ctx) {
    const card = el('div', 'card c-calendar gen');
    if (props.title) card.append(el('h3', null, props.title));
    const path = boundPath(ctx.raw, ctx.scope);
    const events = eventsByDate(props.events);
    const selectedIso = toISODate(parseISODate(props.value ?? props.selected));
    const monthStart = ctx.ui.month
      ?? parseMonth(props.month)
      ?? parseMonth(selectedIso)
      ?? startOfMonth(new Date());

    card.append(monthGrid({
      monthStart,
      selectedIso,
      events,
      min: props.min,
      max: props.max,
      onMonth: (next) => { ctx.ui.month = next; ctx.rerender(); },
      onPick: path ? (iso) => { ctx.ui.month = parseMonth(iso); ctx.setData(path, iso, { rerenderSelf: true }); } : null,
    }));

    // Los eventos del día elegido (o del mes visible si no hay ninguno elegido).
    const listed = selectedIso && events.has(selectedIso)
      ? events.get(selectedIso).map((e) => ({ ...e, date: selectedIso }))
      : [...events.entries()]
        .filter(([iso]) => iso.slice(0, 7) === toISODate(monthStart).slice(0, 7))
        .flatMap(([iso, items]) => items.map((e) => ({ ...e, date: iso })))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (listed.length) {
      const list = el('div', 'cal-events');
      for (const item of listed.slice(0, 6)) {
        const row = el('div', 'cal-event');
        row.append(el('span', `a2-cal-dot is-${eventKind(item)}`));
        const main = el('div', 'cal-event-main');
        main.append(el('div', 'cal-event-label', asText(item.label ?? item.summary ?? 'Evento')));
        main.append(el('div', 'cal-event-date', formatDate(item.date)));
        row.append(main);
        if (item.amount !== undefined && item.amount !== null) row.append(el('div', 'cal-event-amt', moneyOrText(item.amount)));
        list.append(row);
      }
      card.append(list);
    } else if (props.emptyText) {
      card.append(el('p', 'a2-empty', props.emptyText));
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
    const variant = ['header', 'chart', 'cards', 'kpis', 'list', 'form', 'plan', 'calendar', 'text'].includes(props.variant) ? props.variant : 'text';
    const node = el('div', `a2-skeleton is-${variant}`);
    const blocks = { header: 2, chart: 1, cards: 3, kpis: 3, list: 4, form: 3, plan: 4, calendar: 2, text: 2 }[variant];
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
  DatePicker(props, ctx) {
    const path = boundPath(ctx.raw, ctx.scope);
    const field = el('div', 'f-field gen a2-control a2-datepicker');
    if (props.label) field.append(el('label', null, asText(props.label)));
    const selectedIso = toISODate(parseISODate(props.value));

    const trigger = el('button', `a2-date-trigger${selectedIso ? ' has-value' : ''}`);
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', String(Boolean(ctx.ui.open)));
    trigger.append(el('span', 'a2-date-icon', '📅'));
    trigger.append(el('span', null, selectedIso ? formatDate(selectedIso) : asText(props.placeholder ?? 'Elegir fecha')));
    trigger.addEventListener('click', () => { ctx.ui.open = !ctx.ui.open; ctx.rerender(); });
    field.append(trigger);

    if (ctx.ui.open) {
      const pop = el('div', 'a2-date-pop');
      pop.setAttribute('role', 'dialog');
      pop.append(monthGrid({
        monthStart: ctx.ui.month ?? parseMonth(selectedIso) ?? parseMonth(props.month) ?? startOfMonth(new Date()),
        selectedIso,
        events: eventsByDate(props.events),
        min: props.min,
        max: props.max,
        onMonth: (next) => { ctx.ui.month = next; ctx.rerender(); },
        onPick: (iso) => {
          ctx.ui.open = false;
          ctx.ui.month = parseMonth(iso);
          if (path) ctx.setData(path, iso, { rerenderSelf: true });
          else ctx.rerender();
        },
      }));
      field.append(pop);
    }
    if (props.hint) field.append(el('div', 'p-cap', props.hint));
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

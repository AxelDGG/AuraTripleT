// Núcleo de Norte A2UI v2: punteros, bindings, funciones, aplanado, compat y runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_ID,
  COMPONENT_NAMES_V2,
  RENDERER_FUNCTION_NAMES,
  callRendererFunction,
  canonicalComponentName,
  catalogDescriptor,
  componentsPromptSectionV2,
  containsBinding,
  createSurfaceStore,
  flattenTree,
  formatCompact,
  formatCurrency,
  formatPercent,
  getAt,
  joinPointer,
  liftV1Component,
  orderFromRoot,
  pointersOverlap,
  resolveDynamic,
  resolveProps,
  resolveTableColumns,
  tableRow,
  setAt,
  surfaceFromV1,
  toV1Components,
  treeFromFlat,
  unwrapMessage,
  wrapMessage,
} from '../src/index.js';

// ---------- tablas ----------

test('las columnas de una tabla se resuelven contra filas-objeto (encabezado en español, llave en inglés)', () => {
  const rows = [{ id: 'TX-1', accountId: 'ACC-001', date: '2026-09-01', description: 'Netflix', category: 'Entretenimiento', amount: -299 }];
  const columns = resolveTableColumns(['Fecha', 'Concepto', 'Monto'], rows);
  assert.deepEqual(columns.map((c) => c.key), ['date', 'description', 'amount']);
  assert.deepEqual(columns.map((c) => c.label), ['Fecha', 'Concepto', 'Monto']);
  assert.deepEqual(columns.map((c) => c.format), ['date', undefined, 'currency']);
  assert.deepEqual(tableRow(rows[0], columns), ['2026-09-01', 'Netflix', -299]);
});

test('una columna que declara su key gana, y la que no resuelve queda vacía en vez de inventar', () => {
  const rows = [{ name: 'Banorte Oro', paymentDue: '2026-09-15', minimumPayment: 1870, status: 'Pendiente' }];
  const columns = resolveTableColumns(
    [{ key: 'name', label: 'Tarjeta' }, { key: 'paymentDue', label: 'Fecha límite', format: 'date' }, { key: 'minimumPayment', label: 'Pago mínimo' }, 'Sucursal'],
    rows,
  );
  assert.deepEqual(columns.map((c) => c.key), ['name', 'paymentDue', 'minimumPayment', 'Sucursal']);
  assert.deepEqual(tableRow(rows[0], columns), ['Banorte Oro', '2026-09-15', 1870, '']);
});

test('sin columnas, las dicta la fila: llaves técnicas fuera y etiquetas en español', () => {
  const columns = resolveTableColumns(undefined, [{ id: 'TX-1', accountId: 'ACC-001', date: '2026-09-01', description: 'Netflix', amount: -299 }]);
  assert.deepEqual(columns.map((c) => c.key), ['date', 'description', 'amount']);
  assert.deepEqual(columns.map((c) => c.label), ['Fecha', 'Concepto', 'Monto']);
});

test('las filas-arreglo se respetan tal cual y las columnas conservan su etiqueta', () => {
  const columns = resolveTableColumns(['A', 'B'], [['1', '2']]);
  assert.deepEqual(columns.map((c) => c.key), ['A', 'B']);
  assert.deepEqual(tableRow(['1', '2'], columns), ['1', '2']);
});

test('encabezados desconocidos caen a la posición solo si hay tantas llaves como columnas', () => {
  const cerca = resolveTableColumns(['Uno', 'Dos'], [{ alfa: 1, beta: 2 }]);
  assert.deepEqual(cerca.map((c) => c.key), ['alfa', 'beta']);
  const lejos = resolveTableColumns(['Uno', 'Dos'], [{ alfa: 1, beta: 2, gamma: 3 }]);
  assert.deepEqual(lejos.map((c) => c.key), ['Uno', 'Dos'], 'sin correspondencia clara no se adivina');
});

// ---------- pointer ----------

test('JSON Pointer: get/set inmutable, escapes RFC 6901 y contenedores intermedios', () => {
  const model = { plan: { months: 12 }, 'a/b': { '~x': 1 } };
  assert.equal(getAt(model, '/plan/months'), 12);
  assert.equal(getAt(model, '/a~1b/~0x'), 1);
  assert.equal(getAt(model, ''), model);
  assert.equal(getAt(model, '/no/existe'), undefined);

  const next = setAt(model, '/plan/months', 24);
  assert.equal(next.plan.months, 24);
  assert.equal(model.plan.months, 12, 'el modelo original no se muta');
  assert.equal(next['a/b'], model['a/b'], 'las ramas no tocadas se comparten');

  const deep = setAt({}, '/txs/0/amount', 5);
  assert.ok(Array.isArray(deep.txs));
  assert.equal(deep.txs[0].amount, 5);

  assert.deepEqual(setAt(model, '/plan/months', null).plan, {}, 'null borra la llave');
  assert.throws(() => getAt(model, 'sin-barra'));
});

test('pointers: join relativo/absoluto y solapamiento entre rutas', () => {
  assert.equal(joinPointer('/txs/3', 'amount'), '/txs/3/amount');
  assert.equal(joinPointer('/txs/3', '/abs'), '/abs');
  assert.equal(joinPointer('/txs/3', ''), '/txs/3');
  assert.ok(pointersOverlap('/plan', '/plan/months'));
  assert.ok(pointersOverlap('/plan/months', '/plan'));
  assert.ok(!pointersOverlap('/plan/months', '/plan/rate'));
  assert.ok(pointersOverlap('', '/lo/que/sea'));
});

// ---------- format y funciones ----------

test('formato es-MX sin Intl: moneda, compacto y porcentaje idénticos en Node, web y Hermes', () => {
  assert.equal(formatCurrency(18400), '$18,400.00');
  assert.equal(formatCurrency(-1234.5), '-$1,234.50');
  assert.equal(formatCompact(18400), '$18.4 mil');
  assert.equal(formatCompact(2500000), '$2.5 M');
  assert.equal(formatPercent(32.456), '32.5%');
  assert.equal(formatCurrency('nope'), '—');
});

test('renderer functions: amortización, colecciones y lógica', () => {
  const f = (name, args) => callRendererFunction(name, args);
  assert.equal(f('amortize', { amount: 18400, months: 12, annualRate: 32 }), 1811.91);
  assert.equal(f('amortize', { amount: 12000, months: 12, annualRate: 0 }), 1000);
  assert.equal(f('totalInterest', { amount: 18400, months: 12, annualRate: 32 }), 3342.96);
  assert.equal(f('schedule', { amount: 1000, months: 2, annualRate: 0, field: 'balance' }).length, 2);
  assert.deepEqual(f('scheduleLabels', { months: 3 }), ['Mes 1', 'Mes 2', 'Mes 3']);
  assert.equal(f('effectiveAnnual', { annualRate: 32 }), 37.1);
  assert.deepEqual(f('pluck', { items: [{ m: 12 }, { m: 24 }], key: 'm' }), [12, 24]);
  assert.equal(f('lookup', { items: [{ m: 12, pay: 1 }, { m: 24, pay: 2 }], key: 'm', value: 24, field: 'pay' }), 2);
  assert.equal(f('pct', { part: 25, total: 200 }), 12.5);
  assert.equal(f('if', { cond: false, then: 'a', else: 'b' }), 'b');
  assert.equal(f('template', { text: 'Pagas {p} al mes', p: '$1' }), 'Pagas $1 al mes');
  assert.equal(f('inexistente', {}), undefined, 'función desconocida → undefined, nunca lanza');
  assert.ok(RENDERER_FUNCTION_NAMES.includes('currency'));
});

// ---------- binding ----------

test('resolveDynamic: literales, path, call anidado, scope relativo y deps', () => {
  const model = { plan: { balance: 18400, months: 12, rate: 32 }, txs: [{ amount: 5 }, { amount: 7 }] };
  const deps = new Set();
  const value = resolveDynamic(
    { call: 'currency', args: { v: { call: 'amortize', args: { amount: { path: '/plan/balance' }, months: { path: '/plan/months' }, annualRate: { path: '/plan/rate' } } } } },
    { model, deps },
  );
  assert.equal(value, '$1,811.91');
  assert.deepEqual([...deps].sort(), ['/plan/balance', '/plan/months', '/plan/rate']);

  assert.equal(resolveDynamic({ path: 'amount' }, { model, scope: '/txs/1' }), 7);
  assert.equal(resolveDynamic({ path: '/nada', default: 'x' }, { model }), 'x');
  assert.equal(resolveDynamic('literal', { model }), 'literal');
  assert.deepEqual(resolveDynamic({ labels: [{ path: '/plan/months' }, 'b'] }, { model }), { labels: [12, 'b'] });
});

test('resolveProps deja intactas las propiedades estructurales', () => {
  const component = { id: 'x', component: 'Button', label: { path: '/l' }, action: { event: { name: 'go', context: { v: { path: '/l' } } } }, children: ['a'] };
  const resolved = resolveProps(component, { model: { l: 'Ir' } });
  assert.equal(resolved.label, 'Ir');
  assert.deepEqual(resolved.action, component.action);
  assert.deepEqual(resolved.children, ['a']);
  assert.ok(containsBinding(component));
  assert.ok(!containsBinding({ a: [1, { b: 'c' }] }));
});

// ---------- catálogo ----------

test('catálogo v2: nombres canónicos, alias, descriptor y prompt', () => {
  assert.equal(canonicalComponentName('kpi'), 'Kpi');
  assert.equal(canonicalComponentName('Column'), 'Stack');
  assert.equal(canonicalComponentName('choice_chips'), 'ChoiceChips');
  assert.equal(canonicalComponentName('hologram'), null);
  const descriptor = catalogDescriptor();
  assert.equal(descriptor.catalogId, CATALOG_ID);
  assert.deepEqual(descriptor.components.map((c) => c.name), COMPONENT_NAMES_V2);
  const prompt = componentsPromptSectionV2();
  for (const name of COMPONENT_NAMES_V2) assert.ok(prompt.includes(name), name);
  assert.ok(prompt.includes('amortize'));
  const restricted = componentsPromptSectionV2({ only: ['Kpi', 'Text'] });
  assert.ok(restricted.includes('Kpi{'));
  assert.ok(!restricted.includes('Chart{'));
});

// ---------- flatten ----------

test('flattenTree aplana el árbol del modelo a lista de adyacencia con root', () => {
  const { components, rootId } = flattenTree([
    { component: 'Header', title: 'Hola' },
    { type: 'grid', columns: 2, children: [{ component: 'Kpi', id: 'k1', label: 'a' }, { component: 'kpi', id: 'k1', label: 'dup' }] },
    { component: 'Tabs', items: [{ label: 'A', children: [{ component: 'Text', markdown: 'a' }] }, { label: 'B', child: { component: 'Text', markdown: 'b' } }] },
    { component: 'List', items: { path: '/txs' }, template: { component: 'Text', markdown: { path: 'description' } } },
    { component: 'nope' },
    'basura',
  ]);
  assert.equal(rootId, 'root');
  const root = components.find((c) => c.id === 'root');
  assert.equal(root.component, 'Stack');
  assert.equal(root.children.length, 4, 'lo desconocido se descarta');
  const grid = components.find((c) => c.component === 'Grid');
  assert.deepEqual(grid.children.map((id) => components.find((c) => c.id === id).label), ['a', 'dup']);
  assert.notEqual(grid.children[0], grid.children[1], 'ids duplicados se renombran');
  const tabs = components.find((c) => c.component === 'Tabs');
  assert.equal(tabs.items.length, 2);
  assert.equal(components.find((c) => c.id === tabs.items[0].child).component, 'Stack');
  assert.equal(components.find((c) => c.id === tabs.items[1].child).markdown, 'b');
  const list = components.find((c) => c.component === 'List');
  assert.equal(list.children.path, '/txs');
  assert.equal(components.find((c) => c.id === list.children.componentId).component, 'Text');
  assert.equal(components[0].id, 'root', 'la raíz va primero');
  assert.equal(orderFromRoot(components)[0].id, 'root');
  assert.equal(treeFromFlat(components).children[1].children[0].label, 'a');
});

test('flattenTree acepta un objeto raíz y eleva componentes v1 mezclados', () => {
  const { components } = flattenTree({ component: 'Card', title: 'x', children: [{ type: 'alert', text: 'hey' }] });
  assert.equal(components[0].id, 'root');
  assert.equal(components[0].component, 'Card');
  assert.equal(components[1].component, 'Alert');
  assert.equal(components[1].text, 'hey');
});

// ---------- compat ----------

test('liftV1Component y surfaceFromV1 elevan el historial viejo a v2', () => {
  assert.equal(liftV1Component({ type: 'kpi_grid', items: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }] }).children.length, 2);
  assert.equal(liftV1Component({ type: 'balance_cards', accounts: [{ name: 'n', balance: 1 }] }).children[0].component, 'AccountCard');
  assert.equal(liftV1Component({ type: 'nope' }), null);
  const surface = surfaceFromV1([{ type: 'header', title: 'T' }, { type: 'chart', chartType: 'bar', labels: ['a'], datasets: [{ data: [1] }] }], { surfaceId: 'h1' });
  assert.equal(surface.surfaceId, 'h1');
  assert.deepEqual(surface.components.map((c) => c.component), ['Stack', 'Header', 'Chart']);
});

test('toV1Components proyecta la superficie resolviendo bindings y agrupando Kpi/AccountCard', () => {
  const { components } = flattenTree([
    { component: 'Section', title: 'Plan', children: [
      { component: 'Kpi', label: 'Pago', value: { call: 'currency', args: { v: { path: '/pay' } } } },
      { component: 'Kpi', label: 'Meses', value: { path: '/months' } },
      { component: 'Slider', label: 'Plazo', value: { path: '/months' }, unit: 'meses' },
      { component: 'AccountCard', name: 'Nómina', balance: 1 },
      { component: 'Button', label: 'x' },
    ] },
    { component: 'List', items: { path: '/txs' }, template: { component: 'Text', markdown: { path: 'd' } } },
  ]);
  const ui = toV1Components({ components, dataModel: { pay: 1811.91, months: 12, txs: [{ d: 'uno' }, { d: 'dos' }] } });
  assert.deepEqual(ui.map((c) => c.type), ['text', 'kpi_grid', 'text', 'balance_cards', 'text', 'text']);
  assert.equal(ui[1].items[0].value, '$1,811.91');
  assert.equal(ui[1].items[1].value, 12);
  assert.equal(ui[2].markdown, '**Plazo:** 12 meses');
  assert.equal(ui[5].markdown, 'dos');
});

// ---------- runtime ----------

test('store: createSurface/updateComponents/updateDataModel/deleteSurface notifican y resuelven', () => {
  const store = createSurfaceStore();
  const changes = [];
  store.subscribe((c) => changes.push(c));
  const { components } = flattenTree([{ component: 'Kpi', id: 'k', label: 'Meses', value: { path: '/months' } }]);
  store.apply(wrapMessage('createSurface', { surfaceId: 's1', components, dataModel: { months: 12 } }));
  assert.equal(store.resolve('s1', store.getComponent('s1', 'k')).value, 12);

  store.apply({ version: 'v1.0', updateDataModel: { surfaceId: 's1', path: '/months', value: 24 } });
  assert.equal(store.getData('s1', '/months'), 24);
  store.apply({ version: 'v1.0', updateDataModel: { surfaceId: 's1', value: { months: 6 } } });
  assert.equal(store.getData('s1', '/months'), 6, 'sin path se reemplaza el modelo completo');

  store.apply(wrapMessage('updateComponents', { surfaceId: 's1', components: [{ id: 'k', component: 'Kpi', label: 'Nuevo', value: 'x' }] }));
  assert.equal(store.getComponent('s1', 'k').label, 'Nuevo');
  assert.deepEqual(store.snapshot('s1').components.map((c) => c.id), ['root', 'k']);

  assert.equal(store.apply({ nada: true }), null);
  assert.equal(store.apply(wrapMessage('updateDataModel', { surfaceId: 'no-existe', path: '/a', value: 1 })), null);

  store.apply(wrapMessage('deleteSurface', { surfaceId: 's1' }));
  assert.ok(!store.has('s1'));
  assert.deepEqual(changes.map((c) => c.type), ['createSurface', 'updateDataModel', 'updateDataModel', 'updateComponents', 'deleteSurface']);
  assert.deepEqual(unwrapMessage({ kind: 'deleteSurface', surfaceId: 'x' }), { kind: 'deleteSurface', payload: { surfaceId: 'x' } });
});

test('store: cambios locales, filas de List, acciones event y functionCall', () => {
  const store = createSurfaceStore();
  const { components } = flattenTree([
    { component: 'Slider', id: 'sl', value: { path: '/plan/months' } },
    { component: 'List', id: 'lst', items: { path: '/txs' }, template: { component: 'Text', id: 'tpl', markdown: { path: 'd' } } },
    { component: 'List', id: 'lit', items: [{ d: 'literal' }], template: { component: 'Text', id: 'tpl2', markdown: { path: 'd' } } },
  ]);
  store.apply(wrapMessage('createSurface', { surfaceId: 's', components, dataModel: { plan: { months: 12 }, txs: [{ d: 'a' }, { d: 'b' }] } }));

  const local = [];
  store.subscribe((c) => c.source === 'local' && local.push(c));
  assert.ok(store.setData('s', '/plan/months', 18, { origin: 'sl' }));
  assert.equal(local[0].origin, 'sl');
  assert.ok(!store.setData('s', 'sin-barra', 1));

  const rows = store.listRows('s', store.getComponent('s', 'lst'));
  assert.deepEqual(rows.map((r) => r.scope), ['/txs/0', '/txs/1']);
  assert.equal(store.resolve('s', store.getComponent('s', 'tpl'), { scope: rows[1].scope }).markdown, 'b');
  assert.equal(store.listRows('s', store.getComponent('s', 'lit')).length, 1, 'items literales se siembran en el modelo');

  const event = store.dispatchAction('s', { event: { name: 'apply', context: { months: { path: '/plan/months' } } } });
  assert.equal(event.kind, 'event');
  assert.deepEqual(event.payload.event, { name: 'apply', context: { months: 18 } });
  assert.equal(event.payload.dataModel.plan.months, 18, 'sendDataModel manda el modelo completo');

  assert.equal(store.dispatchAction('s', { functionCall: { call: 'increment', args: { path: '/plan/months', by: 6, max: 36 } } }).kind, 'local');
  assert.equal(store.getData('s', '/plan/months'), 24);
  assert.equal(store.dispatchAction('s', { functionCall: { call: 'eval', args: {} } }), null, 'solo acciones locales conocidas');
  assert.equal(store.dispatchAction('s', { nada: 1 }), null);
});

test('un path con comodín (* o [*]) recorre la lista, como lo escriben los modelos', () => {
  const model = { gastos: [{ cat: 'Casa', total: 9500 }, { cat: 'Súper', total: 7011 }] };
  const deps = new Set();
  assert.deepEqual(resolveDynamic({ path: '/gastos/*/cat' }, { model, deps }), ['Casa', 'Súper']);
  assert.deepEqual(resolveDynamic({ path: '/gastos/[*]/total' }, { model }), [9500, 7011]);
  assert.deepEqual(resolveDynamic({ path: '/gastos/*' }, { model }), model.gastos);
  assert.equal(resolveDynamic({ path: '/nada/*/x' }, { model }), undefined);
  assert.deepEqual([...deps], ['/gastos'], 'la dependencia es la lista completa');
});

// Las dos redes que impiden que la pantalla salga con huecos:
//   - degradeComponents: lo que el cliente no sabe pintar se cambia por lo más
//     parecido que sí conozca (negociación de catálogo, docs/A2UI.md §8)
//   - normalizeAgentReply: lo que el modelo escribe mal se repara o se quita,
//     y siempre queda registrado en `warnings`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { degradeComponents, normalizeAgentReply, unsupportedComponents } from '../src/index.js';

const CLIENTE_SIN_AGENDA = ['Stack', 'Grid', 'Header', 'Kpi', 'Table', 'Text', 'TextField', 'Select', 'Button', 'Alert'];

const byId = (components) => Object.fromEntries(components.map((c) => [c.id, c]));

test('sin negociación no se toca nada', () => {
  const components = [{ id: 'root', component: 'Stack', children: ['c1'] }, { id: 'c1', component: 'Calendar', events: [] }];
  const { components: out, notes } = degradeComponents(components, null);
  assert.deepEqual(out, components);
  assert.equal(notes.length, 0);
});

test('un contenedor que el cliente no tiene se vuelve Stack y conserva sus hijos', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['tabs'] },
    { id: 'tabs', component: 'Tabs', items: [{ label: '12 meses', child: 'a' }, { label: '24 meses', child: 'b' }] },
    { id: 'a', component: 'Text', markdown: 'doce' },
    { id: 'b', component: 'Text', markdown: 'veinticuatro' },
  ];
  const { components: out, notes } = degradeComponents(components, CLIENTE_SIN_AGENDA);
  const tabs = byId(out).tabs;
  assert.equal(tabs.component, 'Stack');
  assert.deepEqual(tabs.children, ['a', 'b']);
  assert.deepEqual(notes, [{ id: 'tabs', from: 'Tabs', to: 'Stack' }]);
});

test('DataTable se convierte en Table con las mismas filas', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['dt'] },
    {
      id: 'dt',
      component: 'DataTable',
      title: 'Pagos',
      columns: [{ key: 'name', label: 'Tarjeta' }, { key: 'amount', label: 'Monto', format: 'currency' }],
      rows: [{ name: 'Oro', amount: 1200 }, { name: 'Clásica', amount: 340 }],
    },
  ];
  const { components: out } = degradeComponents(components, CLIENTE_SIN_AGENDA);
  const table = byId(out).dt;
  assert.equal(table.component, 'Table');
  assert.deepEqual(table.columns, ['Tarjeta', 'Monto']);
  assert.deepEqual(table.rows, [['Oro', 1200], ['Clásica', 340]]);
});

test('Calendar se convierte en una tabla de fecha y evento', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['cal'] },
    {
      id: 'cal',
      component: 'Calendar',
      title: 'Septiembre',
      events: [{ date: '2026-09-15', label: 'Tarjeta Oro', kind: 'payment' }],
    },
  ];
  const { components: out, notes } = degradeComponents(components, CLIENTE_SIN_AGENDA);
  assert.equal(byId(out).cal.component, 'Table');
  assert.deepEqual(byId(out).cal.rows, [['2026-09-15', 'Tarjeta Oro']]);
  assert.deepEqual(notes, [{ id: 'cal', from: 'Calendar', to: 'Table' }]);
});

test('un control que el cliente no tiene conserva su ruta en el control equivalente', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['d', 's'] },
    { id: 'd', component: 'DatePicker', label: 'Fecha', value: { path: '/schedule/date' } },
    { id: 's', component: 'Slider', label: 'Plazo', value: { path: '/plan/months' }, min: 6, max: 18, step: 6, unit: 'meses' },
  ];
  const { components: out } = degradeComponents(components, CLIENTE_SIN_AGENDA);
  assert.equal(byId(out).d.component, 'TextField');
  assert.deepEqual(byId(out).d.value, { path: '/schedule/date' });
  // Slider → Select con una opción por escalón: sigue escribiendo en la misma ruta.
  assert.equal(byId(out).s.component, 'Select');
  assert.deepEqual(byId(out).s.value, { path: '/plan/months' });
  assert.deepEqual(byId(out).s.options.map((o) => o.value), [6, 12, 18]);
});

test('lo que no se puede convertir se queda en texto, nunca en un hueco', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['chart'] },
    // labels por binding: el dato vive en el cliente, no se puede tabular aquí.
    { id: 'chart', component: 'Chart', chartType: 'line', title: 'Saldo proyectado', labels: { path: '/plan/labels' } },
  ];
  const { components: out, notes } = degradeComponents(components, CLIENTE_SIN_AGENDA.filter((n) => n !== 'Table'));
  assert.equal(byId(out).chart.component, 'Text');
  assert.match(byId(out).chart.markdown, /Saldo proyectado/);
  assert.deepEqual(notes, [{ id: 'chart', from: 'Chart', to: 'Text' }]);
});

test('si un bloque desaparece, deja de colgar de su padre', () => {
  const components = [
    { id: 'root', component: 'Stack', children: ['div', 'txt'] },
    { id: 'div', component: 'Divider' },
    { id: 'txt', component: 'Text', markdown: 'hola' },
  ];
  const { components: out, notes } = degradeComponents(components, ['Stack', 'Text']);
  assert.deepEqual(byId(out).root.children, ['txt']);
  assert.deepEqual(notes, [{ id: 'div', from: 'Divider', to: null }]);
});

test('unsupportedComponents dice qué le falta al cliente', () => {
  const components = [{ id: 'root', component: 'Stack' }, { id: 'c', component: 'Calendar' }, { id: 's', component: 'Skeleton' }];
  assert.deepEqual(unsupportedComponents(components, CLIENTE_SIN_AGENDA), ['Calendar']);
  assert.deepEqual(unsupportedComponents(components, null), []);
});

// ---------- reparaciones del normalizador ----------

test('un control con value literal se liga a una ruta en vez de quedar muerto', () => {
  const reply = normalizeAgentReply({
    message: 'm',
    dataModel: { plan: { months: 12 } },
    ui: [{ component: 'Slider', label: 'Plazo', value: 12, min: 6, max: 36, step: 6 }],
  }, { surfaceId: 's1' });

  const slider = reply.surface.components.find((c) => c.component === 'Slider');
  assert.deepEqual(slider.value, { path: `/_controls/${slider.id}` });
  assert.equal(reply.surface.dataModel._controls[slider.id], 12);
  assert.equal(reply.warnings.repairedControls.length, 1);
  // El dataModel del modelo no se muta: la superficie lleva su propia copia.
  assert.deepEqual(reply.surface.dataModel.plan, { months: 12 });
});

test('un control ligado a un valor derivado se rescata sin arrastrar el binding', () => {
  const reply = normalizeAgentReply({
    message: 'm',
    dataModel: { plan: { months: 12 } },
    // {call} es un valor derivado: el control no puede escribir ahí.
    ui: [{ component: 'Select', label: 'Plazo', value: { call: 'number', args: { v: { path: '/plan/months' } } }, options: [] }],
  }, { surfaceId: 's1' });

  const select = reply.surface.components.find((c) => c.component === 'Select');
  assert.deepEqual(select.value, { path: `/_controls/${select.id}` });
  assert.equal(reply.surface.dataModel._controls[select.id], '');
});

test('la acción de un Button se normaliza y, si no dispara nada, el botón se va', () => {
  const reply = normalizeAgentReply({
    message: 'm',
    ui: [
      { component: 'Button', label: 'Texto plano', action: 'confirm_restructure' },
      { component: 'Button', label: 'Sin sobre', action: { name: 'confirm_schedule_payment', context: { a: 1 } } },
      { component: 'Button', label: 'Muerto' },
    ],
  }, { surfaceId: 's1' });

  const buttons = reply.surface.components.filter((c) => c.component === 'Button');
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons[0].action, { event: { name: 'confirm_restructure', context: {} } });
  assert.deepEqual(buttons[1].action, { event: { name: 'confirm_schedule_payment', context: { a: 1 } } });
  assert.equal(reply.warnings.deadButtons.length, 1);
  // Y el que se fue no queda referenciado por la raíz.
  const root = reply.surface.components.find((c) => c.id === 'root');
  assert.equal(root.children.length, 2);
});

test('un componente inventado se descarta pero queda registrado', () => {
  const reply = normalizeAgentReply({
    message: 'm',
    ui: [{ component: 'Header', title: 'Hola' }, { component: 'Hologram', shiny: true }],
  }, { surfaceId: 's1' });

  assert.deepEqual(reply.surface.components.map((c) => c.component), ['Stack', 'Header']);
  assert.deepEqual(reply.warnings.dropped, ['Hologram']);
});

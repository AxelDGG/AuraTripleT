import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENT_TYPES,
  COMPONENT_CATALOG,
  componentsPromptSection,
  normalizeComponent,
  normalizeUiSpec,
  SPEC_VERSION,
} from '../src/index.js';

test('el catálogo define exactamente los 10 tipos del contrato', () => {
  assert.equal(SPEC_VERSION, 'norte-ui-spec/v1');
  assert.deepEqual(COMPONENT_TYPES, [
    'header', 'kpi_grid', 'balance_cards', 'chart', 'table',
    'transaction_list', 'form', 'alert', 'progress', 'text',
  ]);
  assert.deepEqual(COMPONENT_CATALOG.map((c) => c.type), COMPONENT_TYPES);
});

test('la sección del prompt se genera del catálogo con el formato original', () => {
  const section = componentsPromptSection();
  const lines = section.split('\n');
  assert.equal(lines[0], 'COMPONENTES DE UI DISPONIBLES (elige los que mejor comuniquen la respuesta, usualmente 2-5):');
  assert.equal(lines.length, 11);
  assert.equal(
    lines[2],
    '- {"type":"kpi_grid","items":[{"label":"...","value":"$48,250.75","delta":"+12%","trend":"up|down|neutral","icon":"💰"}]} — métricas clave (2-4 items).',
  );
  for (const type of COMPONENT_TYPES) assert.ok(section.includes(`"type":"${type}"`));
});

test('normalizeUiSpec conserva message y ui válidos', () => {
  const spec = normalizeUiSpec({ message: 'hola', ui: [{ type: 'alert', text: 'x' }] });
  assert.equal(spec.message, 'hola');
  assert.equal(spec.ui.length, 1);
  assert.equal(spec.ui[0].type, 'alert');
});

test('normalizeUiSpec rellena message y ui faltantes o con tipo incorrecto', () => {
  assert.deepEqual(normalizeUiSpec({ message: 42 }), { message: '', ui: [] });
  assert.deepEqual(normalizeUiSpec({ ui: 'nope' }), { message: '', ui: [] });
  assert.deepEqual(normalizeUiSpec(null), { message: '', ui: [] });
});

test('normalizeUiSpec descarta componentes desconocidos o que no son objetos', () => {
  const spec = normalizeUiSpec({
    message: 'm',
    ui: [{ type: 'hologram' }, 'texto suelto', null, { type: 'text', markdown: 'ok' }],
  });
  assert.equal(spec.ui.length, 1);
  assert.equal(spec.ui[0].type, 'text');
});

test('form: acepta inputs/type y opciones como strings, y los normaliza a fields/inputType/objetos', () => {
  const form = normalizeComponent({
    type: 'form',
    action: 'transfer_funds',
    inputs: [
      { name: 'amount', type: 'number', placeholder: '0.00' },
      { name: 'destino', options: ['BEN-01', { value: 'ACC-002', label: 'Ahorro' }] },
    ],
  });
  assert.equal(form.fields.length, 2);
  assert.equal(form.inputs, undefined);
  assert.equal(form.fields[0].inputType, 'number');
  assert.equal(form.fields[0].type, undefined);
  assert.equal(form.fields[1].inputType, 'select');
  assert.deepEqual(form.fields[1].options, [
    { value: 'BEN-01', label: 'BEN-01' },
    { value: 'ACC-002', label: 'Ahorro' },
  ]);
});

test('form: un inputType inválido cae a text y una action faltante recibe un valor por defecto', () => {
  const form = normalizeComponent({ type: 'form', fields: [{ name: 'x', inputType: 'date' }] });
  assert.equal(form.fields[0].inputType, 'text');
  assert.equal(form.action, 'accion');
});

test('chart: acota chartType a los valores conocidos y coacciona los datos a números', () => {
  const chart = normalizeComponent({
    type: 'chart',
    chartType: 'radar',
    labels: ['Comida', 12],
    datasets: [{ label: 'Gasto', data: ['1200', 300, 'abc'] }],
  });
  assert.equal(chart.chartType, 'bar');
  assert.deepEqual(chart.labels, ['Comida', '12']);
  assert.deepEqual(chart.datasets[0].data, [1200, 300, 0]);
});

test('alert, balance_cards y kpi_grid acotan sus enums a valores conocidos', () => {
  assert.equal(normalizeComponent({ type: 'alert', level: 'fatal', text: 'x' }).level, 'info');
  const cards = normalizeComponent({ type: 'balance_cards', accounts: [{ name: 'Nómina', kind: 'wallet', balance: 10 }] });
  assert.equal(cards.accounts[0].kind, 'checking');
  assert.equal(cards.accounts[0].balance, 10);
  const kpis = normalizeComponent({ type: 'kpi_grid', items: [{ label: 'Total', value: 48250.75, trend: 'sideways' }] });
  assert.equal(kpis.items[0].trend, 'neutral');
  assert.equal(kpis.items[0].value, '48250.75');
});

test('progress acota value a 0-100 y text acepta el campo text como markdown', () => {
  assert.equal(normalizeComponent({ type: 'progress', value: 140 }).value, 100);
  assert.equal(normalizeComponent({ type: 'progress', value: -5 }).value, 0);
  const txt = normalizeComponent({ type: 'text', text: 'hola **mundo**' });
  assert.equal(txt.markdown, 'hola **mundo**');
  assert.equal(txt.text, undefined);
});

test('table y transaction_list toleran filas y montos mal tipados', () => {
  const table = normalizeComponent({ type: 'table', columns: ['A', 'B'], rows: [['1', 2], 'fila rota'] });
  assert.deepEqual(table.rows, [['1', '2'], []]);
  const txs = normalizeComponent({ type: 'transaction_list', items: [{ description: 'Uber', amount: '-120.5' }] });
  assert.equal(txs.items[0].amount, -120.5);
});

test('los campos desconocidos se conservan (contrato tolerante al modelo)', () => {
  const header = normalizeComponent({ type: 'header', title: 'Hola', accent: 'rose' });
  assert.equal(header.accent, 'rose');
});

test('listas de texto descartan solo los elementos inválidos (un null no borra los labels)', () => {
  const chart = normalizeComponent({ type: 'chart', labels: ['Ene', null, { x: 1 }, 'Mar', 4], datasets: [] });
  assert.deepEqual(chart.labels, ['Ene', 'Mar', '4']);
  const table = normalizeComponent({ type: 'table', columns: ['A', null, 'C'], rows: [['1', '2', '3']] });
  assert.deepEqual(table.columns, ['A', 'C']);
  assert.deepEqual(normalizeComponent({ type: 'table', columns: 'no-lista', rows: [] }).columns, []);
});

test('los campos numéricos no aceptan booleanos ni null (caen a 0)', () => {
  const txs = normalizeComponent({ type: 'transaction_list', items: [{ description: 'a', amount: true }, { description: 'b', amount: null }] });
  assert.deepEqual(txs.items.map((t) => t.amount), [0, 0]);
  assert.equal(normalizeComponent({ type: 'progress', value: '42.5' }).value, 42.5);
});

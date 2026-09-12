import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_GUIDE,
  CHART_TYPES,
  COMPONENT_TYPES,
  COMPONENT_CATALOG,
  DEFAULT_FOLDER,
  FOLDER_IDS,
  chartsPromptSection,
  componentsPromptSection,
  foldersPromptSection,
  normalizeComponent,
  normalizeFolder,
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
  const vacio = { message: '', ui: [], folder: DEFAULT_FOLDER, title: 'Visualización' };
  assert.deepEqual(normalizeUiSpec({ message: 42 }), vacio);
  assert.deepEqual(normalizeUiSpec({ ui: 'nope' }), vacio);
  assert.deepEqual(normalizeUiSpec(null), vacio);
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
  // `treemap` existe en otras librerías pero no en nuestro catálogo: cae al default.
  const chart = normalizeComponent({
    type: 'chart',
    chartType: 'treemap',
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

test('las carpetas del historial son un catálogo cerrado de cinco', () => {
  assert.deepEqual(FOLDER_IDS, ['transacciones', 'promociones', 'movimientos', 'gastos', 'otros']);
  assert.equal(DEFAULT_FOLDER, 'otros');
});

test('normalizeFolder tolera mayúsculas, acentos, alias y valores ausentes', () => {
  assert.equal(normalizeFolder('GASTOS'), 'gastos');
  assert.equal(normalizeFolder('  Movimientos  '), 'movimientos');
  assert.equal(normalizeFolder('transferencias'), 'transacciones');
  assert.equal(normalizeFolder('crédito'), 'promociones');
  assert.equal(normalizeFolder('estado de cuenta'), 'movimientos');
  assert.equal(normalizeFolder('carpeta inventada'), 'otros');
  assert.equal(normalizeFolder(undefined), 'otros');
  assert.equal(normalizeFolder(null), 'otros');
});

test('la sección de carpetas del prompt lista los cinco ids', () => {
  const section = foldersPromptSection();
  for (const id of FOLDER_IDS) assert.ok(section.includes(`"${id}"`));
});

test('normalizeUiSpec toma la carpeta del modelo y la normaliza', () => {
  const spec = normalizeUiSpec({ message: 'm', folder: 'TRANSFERENCIAS', ui: [] });
  assert.equal(spec.folder, 'transacciones');
});

test('el título del historial: el del modelo gana, luego el header, luego el mensaje', () => {
  const explicito = normalizeUiSpec({ message: 'm', title: 'Mi corte del mes', ui: [{ type: 'header', title: 'Otro' }] });
  assert.equal(explicito.title, 'Mi corte del mes');

  const desdeHeader = normalizeUiSpec({ message: 'Aquí están tus gastos.', ui: [{ type: 'header', title: 'Gastos de agosto' }] });
  assert.equal(desdeHeader.title, 'Gastos de agosto');

  const desdeComponente = normalizeUiSpec({ message: 'm', ui: [{ type: 'chart', title: 'Gasto por categoría' }] });
  assert.equal(desdeComponente.title, 'Gasto por categoría');

  const desdeMensaje = normalizeUiSpec({ message: 'Tu saldo es $48,250.75. Creció 12% este mes.', ui: [] });
  assert.equal(desdeMensaje.title, 'Tu saldo es $48,250.75.');
});

test('el título se recorta a 80 caracteres con elipsis', () => {
  const largo = 'a'.repeat(200);
  const spec = normalizeUiSpec({ message: 'm', title: largo, ui: [] });
  assert.equal(spec.title.length, 80);
  assert.ok(spec.title.endsWith('…'));
});

test('el catálogo de gráficas cubre el vocabulario de Bklit y el prompt lo expone', () => {
  assert.deepEqual(CHART_TYPES, CHART_GUIDE.map((c) => c.type));
  const section = chartsPromptSection();
  for (const chart of CHART_GUIDE) assert.ok(section.includes(`"${chart.type}"`), chart.type);
  // Las tres decisiones que más se equivocan sin guía explícita.
  assert.ok(section.includes('CÓMO ELEGIR LA GRÁFICA:'));
  assert.ok(section.includes('gauge'));
  assert.ok(section.includes('"target"'));
});

test('los alias de chartType se traducen en vez de caer a bar', () => {
  const as = (chartType) => normalizeComponent({ type: 'chart', chartType }).chartType;
  assert.equal(as('dona'), 'doughnut');
  assert.equal(as('DONUT'), 'doughnut');
  assert.equal(as('apiladas'), 'stacked_bar');
  assert.equal(as('medidor'), 'gauge');
  assert.equal(as('velas'), 'candlestick');
  // Lo que no existe ni tiene alias sigue cayendo al default seguro.
  assert.equal(as('sankey'), 'bar');
  assert.equal(as(undefined), 'bar');
});

test('chart acepta las formas de datos de cada familia de gráfica', () => {
  const scatter = normalizeComponent({
    type: 'chart', chartType: 'scatter',
    datasets: [{ label: 'Compras', data: [{ x: 3, y: 120 }, { x: 8, y: 640 }] }],
  });
  assert.deepEqual(scatter.datasets[0].data[1], { x: 8, y: 640 });

  const candles = normalizeComponent({
    type: 'chart', chartType: 'candlestick',
    datasets: [{ data: [{ o: 10, h: 14, l: 9, c: 13 }] }],
  });
  assert.equal(candles.datasets[0].data[0].h, 14);

  // Números como texto siguen normalizándose; el objeto se conserva íntegro.
  const bars = normalizeComponent({ type: 'chart', chartType: 'bar', datasets: [{ data: ['1200', 3] }] });
  assert.deepEqual(bars.datasets[0].data, [1200, 3]);
});

test('gauge y ring se describen con value/max y sin series', () => {
  const gauge = normalizeComponent({
    type: 'chart', chartType: 'gauge', value: '68', max: 100, format: 'percent', label: 'Uso de tu línea',
  });
  assert.equal(gauge.value, 68);
  assert.equal(gauge.max, 100);
  assert.equal(gauge.format, 'percent');
  assert.deepEqual(gauge.datasets, []);
  // Los opcionales que no vienen no se inventan: el renderer distingue ausencia de cero.
  assert.equal(gauge.target, undefined);
  assert.equal(gauge.stacked, undefined);
  assert.equal(gauge.legend, undefined);
});

test('chart conserva las opciones de presentación y usa currency por defecto', () => {
  const chart = normalizeComponent({
    type: 'chart', chartType: 'composed', labels: ['Ene'],
    series: [{ label: 'Gasto', data: [10], kind: 'bar' }, { label: 'Meta', data: [12], kind: 'line', axis: 'right' }],
    target: '15000', targetLabel: 'Presupuesto', stacked: 'true', subtitle: 'vs. mes anterior', caption: 'Fuente: MCP',
  });
  assert.equal(chart.format, 'currency');
  assert.equal(chart.datasets.length, 2, 'series debe funcionar como alias de datasets');
  assert.equal(chart.datasets[1].axis, 'right');
  assert.equal(chart.target, 15000);
  assert.equal(chart.stacked, true);
  assert.equal(chart.subtitle, 'vs. mes anterior');
  assert.equal(chart.caption, 'Fuente: MCP');
});

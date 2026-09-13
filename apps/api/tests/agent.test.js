// Pruebas del loop del agente con un proveedor LLM falso y el servidor MCP real
// (subproceso stdio): tool calls, compuerta de confirmación, reparación, aborto
// y el streaming A2UI (esqueleto, chunks, patch).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, buildSystemPrompt } from '../src/agent.js';
import { getMcpClient } from '../src/mcp-client.js';

after(async () => {
  const client = await getMcpClient();
  await client.close();
});

const toolCall = (id, name, args) => ({
  id, type: 'function', function: { name, arguments: JSON.stringify(args) },
});

const FINAL_JSON = '{"message":"listo","ui":[{"type":"alert","level":"fatal","text":"x"}]}';

// Proveedor falso: responde con los turnos dados y registra lo que recibe.
function fakeProvider(turns) {
  const received = [];
  return {
    name: 'fake',
    model: 'fake-1',
    received,
    async chat({ messages, tools }) {
      received.push({ messages: structuredClone(messages), tools });
      return turns.shift();
    },
  };
}

// Los resultados de las herramientas ya no viajan como mensajes `tool`: la fase
// de interfaz los recibe como texto dentro del turno del usuario.
function toolData(messages, name) {
  const segment = messages.at(-1).content.split('### ').find((part) => part.startsWith(name));
  assert.ok(segment, `faltan los datos de ${name} en el turno`);
  return JSON.parse(segment.slice(name.length));
}

const types = (events) => events.filter((e) => e.type !== 'a2ui').map((e) => e.type);
const a2uiKinds = (events) => events.filter((e) => e.type === 'a2ui').map((e) => Object.keys(e.message).find((k) => k !== 'version'));

test('runAgent ejecuta tool calls vía MCP, cierra el ciclo y emite la UI normalizada', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_accounts', {})] },
    { role: 'assistant', content: FINAL_JSON },
  ]);

  const result = await runAgent({ userMessage: 'mis cuentas', emit: (e) => events.push(e), provider, streamDelayMs: 0 });

  assert.deepEqual(types(events), ['status', 'status', 'tool_call', 'tool_result', 'status', 'ui']);
  assert.equal(result.message, 'listo');
  assert.equal(result.ui[0].level, 'info'); // enum acotado por el contrato
  assert.equal(result.surface.components[1].component, 'Alert');
  assert.ok(provider.received[0].tools.some((t) => t.function.name === 'get_accounts'));
  assert.ok(!provider.received[1].tools, 'la fase de interfaz ya no paga los esquemas de las herramientas');
  assert.equal(toolData(provider.received[1].messages, 'get_accounts').length, 3);
});

test('runAgent transmite la superficie A2UI por partes: esqueleto al pedir herramientas, luego datos y chunks', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_spending_by_category', {}), toolCall('c2', 'get_accounts', {})] },
    {
      role: 'assistant',
      content: JSON.stringify({
        message: 'ok', title: 'Gastos', folder: 'gastos',
        dataModel: { total: 100 },
        ui: [
          { component: 'Header', title: 'Gastos' },
          { component: 'Grid', columns: 2, children: [{ component: 'Kpi', label: 'Total', value: { path: '/total' } }, { component: 'Kpi', label: 'b', value: '1' }] },
          { component: 'Chart', chartType: 'doughnut', labels: ['a'], datasets: [{ data: [1] }] },
        ],
      }),
    },
  ]);

  await runAgent({ userMessage: 'gastos', emit: (e) => events.push(e), provider, streamDelayMs: 0 });

  const a2ui = events.filter((e) => e.type === 'a2ui').map((e) => e.message);
  assert.equal(a2ui[0].version, 'v1.0');
  const skeleton = a2ui[0].createSurface;
  assert.ok(skeleton, 'el esqueleto sale con el primer tool call');
  assert.deepEqual(skeleton.components.map((c) => c.component), ['Stack', 'Skeleton', 'Skeleton', 'Skeleton']);
  assert.deepEqual(skeleton.components.slice(1).map((c) => c.variant), ['header', 'chart', 'cards']);
  // El esqueleto ya salió antes de que la primera herramienta respondiera.
  assert.ok(events.indexOf(events.find((e) => e.type === 'a2ui')) < events.indexOf(events.find((e) => e.type === 'tool_result')));

  assert.deepEqual(a2ui.slice(1).map((m) => Object.keys(m).find((k) => k !== 'version')), ['updateDataModel', 'updateComponents', 'updateComponents']);
  assert.deepEqual(a2ui[1].updateDataModel, { surfaceId: skeleton.surfaceId, path: '', value: { total: 100 } });
  assert.equal(a2ui[2].updateComponents.components[0].id, 'root', 'la raíz viaja en el primer chunk');
  const sent = a2ui.slice(2).flatMap((m) => m.updateComponents.components.map((c) => c.component));
  assert.deepEqual(sent, ['Stack', 'Header', 'Grid', 'Chart', 'Kpi', 'Kpi']);

  const ui = events.find((e) => e.type === 'ui');
  assert.equal(ui.surfaceId, skeleton.surfaceId, 'la superficie final reemplaza al esqueleto con el mismo id');
  assert.equal(ui.surface.components.length, 6);
  assert.deepEqual(ui.ui.map((c) => c.type), ['header', 'kpi_grid', 'chart']);
  assert.equal(ui.ui[1].items[0].value, '100', 'la proyección v1 resuelve bindings (y v1 lee los KPI como texto)');
});

test('runAgent sin herramientas crea la superficie vacía y luego manda los componentes', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: 'NO_TOOLS' },
    { role: 'assistant', content: '{"message":"hola","title":"Hola","ui":[{"component":"Text","markdown":"hola"}]}' },
  ]);
  await runAgent({ userMessage: 'hola', emit: (e) => events.push(e), provider, streamDelayMs: 0 });
  assert.deepEqual(a2uiKinds(events), ['createSurface', 'updateComponents']);
  assert.deepEqual(events.filter((e) => e.type === 'a2ui')[0].message.createSurface.components, []);
});

test('runAgent responde con un patch sobre la superficie activa sin reconstruirla', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: '{"message":"A 6 meses pagas más.","title":"Plan","folder":"promociones","surfaceId":"s_activa","updates":[{"path":"/plan/months","value":6}]}' },
  ]);
  const result = await runAgent({
    userMessage: '¿y a 6 meses?',
    surface: { surfaceId: 's_activa', title: 'Plan', dataModel: { plan: { months: 12 } } },
    emit: (e) => events.push(e),
    provider,
    streamDelayMs: 0,
  });
  assert.equal(result.kind, 'patch');
  assert.deepEqual(a2uiKinds(events), ['updateDataModel']);
  assert.deepEqual(events.find((e) => e.type === 'a2ui').message.updateDataModel, { surfaceId: 's_activa', path: '/plan/months', value: 6 });
  const ui = events.find((e) => e.type === 'ui');
  assert.equal(ui.patch, true);
  assert.equal(ui.surfaceId, 's_activa');
  const activeNote = provider.received[0].messages.find((m) => m.role === 'system' && m.content.startsWith('SUPERFICIE ACTIVA'));
  assert.match(activeNote.content, /s_activa/);
  assert.match(activeNote.content, /"months":12/);
});

test('runAgent retira el esqueleto si el turno termina siendo un patch', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_accounts', {})] },
    { role: 'assistant', content: '{"message":"ok","surfaceId":"s_activa","updates":[{"path":"/a","value":1}]}' },
  ]);
  await runAgent({ userMessage: 'x', surface: { surfaceId: 's_activa', dataModel: {} }, emit: (e) => events.push(e), provider, streamDelayMs: 0 });
  assert.deepEqual(a2uiKinds(events), ['createSurface', 'deleteSurface', 'updateDataModel']);
});

test('runAgent fuerza confirmed=false en transfer_funds cuando no es un envío de formulario', async () => {
  const events = [];
  const provider = fakeProvider([
    {
      role: 'assistant',
      content: null,
      tool_calls: [toolCall('c1', 'transfer_funds', { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 100, confirmed: true })],
    },
    { role: 'assistant', content: FINAL_JSON },
  ]);

  await runAgent({ userMessage: 'manda 100 a Ana', emit: (e) => events.push(e), provider, streamDelayMs: 0 });

  assert.equal(events.find((e) => e.type === 'tool_call').args.confirmed, false);
  assert.match(toolData(provider.received[1].messages, 'transfer_funds').error, /confirmación/);
});

test('runAgent autoriza transfer_funds solo con el prefijo [form:transfer_funds]', async () => {
  const events = [];
  const provider = fakeProvider([
    {
      role: 'assistant',
      content: null,
      tool_calls: [toolCall('c1', 'transfer_funds', { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 100 })],
    },
    { role: 'assistant', content: FINAL_JSON },
  ]);

  await runAgent({
    userMessage: '[form:transfer_funds] fromAccountId=ACC-001, destino=BEN-02, amount=100',
    emit: (e) => events.push(e),
    provider,
    streamDelayMs: 0,
  });

  assert.equal(events.find((e) => e.type === 'tool_call').args.confirmed, true);
  assert.equal(toolData(provider.received[1].messages, 'transfer_funds').success, true);
});

test('runAgent autoriza transfer_funds con un evento tipado válido y lo niega si el contexto no valida', async () => {
  const run = async (action) => {
    const events = [];
    const provider = fakeProvider([
      { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'transfer_funds', { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 50 })] },
      { role: 'assistant', content: FINAL_JSON },
    ]);
    await runAgent({ userMessage: '[action:x] {}', action, emit: (e) => events.push(e), provider, streamDelayMs: 0 });
    return { confirmed: events.find((e) => e.type === 'tool_call').args.confirmed, user: provider.received[0].messages.at(-1).content };
  };

  const ok = await run({ surfaceId: 's', event: { name: 'confirm_transfer', context: { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 50 } } });
  assert.equal(ok.confirmed, true);
  assert.match(ok.user, /^\[action:confirm_transfer\] \{"fromAccountId":"ACC-001"/);

  const sinDestino = await run({ surfaceId: 's', event: { name: 'confirm_transfer', context: { fromAccountId: 'ACC-001', amount: 50 } } });
  assert.equal(sinDestino.confirmed, false);

  const otroEvento = await run({ surfaceId: 's', event: { name: 'simulate_credit', context: { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 50 } } });
  assert.equal(otroEvento.confirmed, false, 'un evento sin derecho a confirmar no autoriza aunque el contexto valide');
});

test('runAgent pide reparación y devuelve el fallback si el modelo nunca produce JSON válido', async () => {
  const events = [];
  const provider = fakeProvider(Array.from({ length: 6 }, () => ({ role: 'assistant', content: 'no soy json' })));

  const result = await runAgent({ userMessage: 'hola', emit: (e) => events.push(e), provider, streamDelayMs: 0 });

  // Una llamada para elegir herramientas y dos intentos de interfaz (el segundo
  // es la reparación); antes eran seis rondas con el prompt y las tools enteros.
  assert.equal(provider.received.length, 3);
  assert.match(provider.received[2].messages.at(-1).content, /JSON válido/);
  assert.equal(provider.received[2].messages.at(-2).content.length, 'no soy json'.length, 'del intento fallido solo se reenvía un muñón');
  assert.equal(result.ui[0].type, 'alert');
  assert.equal(result.ui[0].level, 'error');
  assert.equal(events.at(-1).type, 'ui');
  assert.equal(events.at(-1).fallback, true);
  assert.deepEqual(a2uiKinds(events), ['createSurface', 'updateComponents']);
});

test('runAgent se detiene sin llamar al modelo cuando la señal ya está abortada', async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = fakeProvider([]);
  const events = [];

  const result = await runAgent({ userMessage: 'hola', emit: (e) => events.push(e), signal: controller.signal, provider, streamDelayMs: 0 });

  assert.equal(result, null);
  assert.equal(provider.received.length, 0);
  assert.ok(events.every((e) => e.type === 'status'));
});

test('el prompt describe el catálogo v2 y se restringe a lo que el cliente anuncia', () => {
  const full = buildSystemPrompt();
  assert.ok(full.includes('Slider{'));
  assert.ok(full.includes('amortize'));
  assert.ok(full.includes('"updates"'));
  const widget = buildSystemPrompt({ clientComponents: ['Kpi', 'Text', 'Stack'] });
  assert.ok(widget.includes('Kpi{'));
  assert.ok(!widget.includes('Slider{'));
});

test('las guías y los flujos del prompt tampoco nombran lo que el cliente no sabe pintar', () => {
  // El catálogo ya se filtraba; los flujos no, y ahí se colaban Calendar,
  // DataTable y DatePicker aunque el cliente no los tuviera.
  const limitado = buildSystemPrompt({
    clientComponents: ['Stack', 'Grid', 'Header', 'Kpi', 'Chart', 'Table', 'Text', 'TextField', 'Select', 'Button', 'Form', 'Alert'],
  });
  for (const nombre of ['Calendar', 'DataTable', 'DatePicker', 'ChoiceChips', 'Slider']) {
    assert.ok(!limitado.includes(nombre), `${nombre} no debería nombrarse para este cliente`);
  }
  // Y los flujos siguen existiendo, con el equivalente que sí tiene.
  assert.ok(limitado.includes('get_card_payment_schedule'));
  assert.ok(limitado.includes('AAAA-MM-DD'));
  assert.ok(limitado.includes('Table'));

  // Con el cliente completo, la guía de agenda vuelve a nombrarlos.
  const completo = buildSystemPrompt();
  for (const nombre of ['Calendar', 'DataTable', 'DatePicker']) assert.ok(completo.includes(nombre), nombre);
});

test('runAgent degrada la superficie a lo que el cliente anunció', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: 'NO_TOOLS' },
    {
      role: 'assistant',
      content: JSON.stringify({
        message: 'tu agenda',
        title: 'Agenda',
        ui: [
          { component: 'Header', title: 'Pagos de septiembre' },
          { component: 'Calendar', title: 'Septiembre', events: [{ date: '2026-09-15', label: 'Tarjeta Oro', kind: 'payment' }] },
        ],
      }),
    },
  ]);

  const result = await runAgent({
    userMessage: 'mis pagos',
    emit: (e) => events.push(e),
    provider,
    streamDelayMs: 0,
    client: { platform: 'widget', components: ['Stack', 'Header', 'Table', 'Text'] },
  });

  const nombres = result.surface.components.map((c) => c.component);
  assert.ok(!nombres.includes('Calendar'), 'el cliente no sabe pintar Calendar');
  assert.ok(nombres.includes('Table'), 'y en su lugar recibe la tabla equivalente');
  // Lo que sale por el stream es lo ya degradado, no la superficie original.
  const enviados = events.filter((e) => e.type === 'a2ui' && e.message.updateComponents)
    .flatMap((e) => e.message.updateComponents.components.map((c) => c.component));
  assert.ok(!enviados.includes('Calendar'));
});

test('el ciclo completo de reestructura: el evento confirm_restructure autoriza restructure_card_debt vía MCP', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'restructure_card_debt', { accountId: 'ACC-003', months: 24 })] },
    {
      role: 'assistant',
      content: JSON.stringify({
        message: 'Listo, tu plan quedó a 24 meses.', title: 'Plan aplicado', folder: 'transacciones',
        ui: [{ component: 'Alert', level: 'success', title: 'Plan aplicado', text: 'Folio en camino' }],
      }),
    },
  ]);
  const action = { surfaceId: 's_plan', event: { name: 'confirm_restructure', context: { accountId: 'ACC-003', months: 24 } }, dataModel: { plan: { months: 24 } } };

  const result = await runAgent({
    userMessage: '[action:confirm_restructure] {"accountId":"ACC-003","months":24}',
    action,
    surface: { surfaceId: 's_plan', title: 'Plan', dataModel: { plan: { months: 24, options: Array.from({ length: 5 }, (_, i) => ({ months: (i + 1) * 6 })) } } },
    emit: (e) => events.push(e),
    provider,
    streamDelayMs: 0,
  });

  const call = events.find((e) => e.type === 'tool_call');
  assert.equal(call.args.confirmed, true);
  const toolResult = toolData(provider.received[1].messages, 'restructure_card_debt');
  assert.equal(toolResult.success, true);
  assert.equal(toolResult.months, 24);
  assert.match(toolResult.folio, /^REST-/);
  assert.equal(result.surface.components[1].level, 'success');
  // La superficie activa se resume: la lista de opciones no viaja completa.
  const note = provider.received[0].messages.find((m) => m.role === 'system' && m.content.startsWith('SUPERFICIE ACTIVA'));
  assert.match(note.content, /…\(5 en total\)/);
});

test('el turno se parte en dos prompts: elegir herramientas y armar la interfaz', async () => {
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_spending_by_category', {})] },
    { role: 'assistant', content: FINAL_JSON },
  ]);
  await runAgent({ userMessage: '¿en qué gasté en agosto?', emit: () => {}, provider, streamDelayMs: 0 });

  const [fase1, fase2] = provider.received.map((r) => r.messages[0].content);
  // Fase 1: las herramientas, sin el catálogo de componentes ni las gráficas.
  assert.ok(provider.received[0].tools.length > 0);
  assert.ok(!fase1.includes('Slider{'), 'la fase de herramientas no paga el catálogo de componentes');
  assert.ok(!fase1.includes('GRÁFICAS'), 'ni la guía de gráficas');
  assert.ok(fase1.includes('NO_TOOLS'));
  // Fase 2: el catálogo, sin los esquemas de las herramientas.
  assert.ok(!provider.received[1].tools, 'la fase de interfaz no vuelve a mandar las herramientas');
  assert.ok(fase2.includes('Slider{'));
  assert.ok(!fase2.includes('NO_TOOLS'));
  // Y cada mitad pesa menos que el prompt entero que antes viajaba dos veces.
  assert.ok(fase1.length + fase2.length < buildSystemPrompt().length * 2);
});

test('el prompt de interfaz solo lleva el flujo y la gráfica de las herramientas que corrieron', async () => {
  const run = async (tool) => {
    const provider = fakeProvider([
      { role: 'assistant', content: null, tool_calls: [toolCall('c1', tool, {})] },
      { role: 'assistant', content: FINAL_JSON },
    ]);
    await runAgent({ userMessage: 'x', emit: () => {}, provider, streamDelayMs: 0 });
    return provider.received[1].messages[0].content;
  };

  const gastos = await run('get_spending_by_category');
  assert.ok(gastos.includes('doughnut (≤6 categorías)'));
  assert.ok(!gastos.includes('FLUJOS'), 'una consulta de gastos no necesita ningún flujo');
  assert.ok(!gastos.includes('get_portfolio_performance'), 'ni la guía de gráficas de otras herramientas');

  const plan = await run('get_card_restructure_options');
  assert.ok(plan.includes('Aplicar plan'), 'el flujo de reestructura sí viaja cuando su herramienta corrió');
  assert.ok(!plan.includes('transfer_funds'));
});

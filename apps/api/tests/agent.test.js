// Pruebas del loop del agente con un proveedor LLM falso y el servidor MCP real
// (subproceso stdio): tool calls, compuerta de confirmación, reparación y aborto.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent.js';
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

test('runAgent ejecuta tool calls vía MCP, cierra el ciclo y emite la UI normalizada', async () => {
  const events = [];
  const provider = fakeProvider([
    { role: 'assistant', content: null, tool_calls: [toolCall('c1', 'get_accounts', {})] },
    { role: 'assistant', content: FINAL_JSON },
  ]);

  const result = await runAgent({ userMessage: 'mis cuentas', emit: (e) => events.push(e), provider });

  assert.deepEqual(events.map((e) => e.type), ['status', 'status', 'tool_call', 'tool_result', 'status', 'ui']);
  assert.equal(result.message, 'listo');
  assert.equal(result.ui[0].level, 'info'); // enum acotado por el contrato
  assert.ok(provider.received[0].tools.some((t) => t.function.name === 'get_accounts'));
  const toolMsg = provider.received[1].messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'c1');
  assert.equal(JSON.parse(toolMsg.content).length, 3);
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

  await runAgent({ userMessage: 'manda 100 a Ana', emit: (e) => events.push(e), provider });

  assert.equal(events.find((e) => e.type === 'tool_call').args.confirmed, false);
  const toolMsg = provider.received[1].messages.find((m) => m.role === 'tool');
  assert.match(JSON.parse(toolMsg.content).error, /confirmación/);
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
  });

  assert.equal(events.find((e) => e.type === 'tool_call').args.confirmed, true);
  const toolMsg = provider.received[1].messages.find((m) => m.role === 'tool');
  assert.equal(JSON.parse(toolMsg.content).success, true);
});

test('runAgent pide reparación y devuelve el fallback si el modelo nunca produce JSON válido', async () => {
  const events = [];
  const provider = fakeProvider(Array.from({ length: 6 }, () => ({ role: 'assistant', content: 'no soy json' })));

  const result = await runAgent({ userMessage: 'hola', emit: (e) => events.push(e), provider });

  assert.equal(provider.received.length, 6);
  assert.match(provider.received[1].messages.at(-1).content, /JSON válido/);
  assert.equal(result.ui[0].type, 'alert');
  assert.equal(result.ui[0].level, 'error');
  assert.equal(events.at(-1).type, 'ui');
});

test('runAgent se detiene sin llamar al modelo cuando la señal ya está abortada', async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = fakeProvider([]);
  const events = [];

  const result = await runAgent({ userMessage: 'hola', emit: (e) => events.push(e), signal: controller.signal, provider });

  assert.equal(result, null);
  assert.equal(provider.received.length, 0);
  assert.ok(events.every((e) => e.type === 'status'));
});

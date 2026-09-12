import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroqProvider, extractFailedGeneration, GROQ_DEFAULT_MODEL } from '../src/providers/groq.js';
import { getLlmProvider, availableProviders } from '../src/providers/index.js';
import { parseUiJson } from '../src/ui-spec.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => body,
});

// Devuelve un fetch falso que responde en orden y registra las llamadas.
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return responses.shift();
  };
  return { impl, calls };
}

const noSleep = async () => {};

test('extractFailedGeneration recupera la UI de un envoltorio de tool call "json"', () => {
  const body = JSON.stringify({
    error: {
      code: 'tool_use_failed',
      message: "attempted to call tool 'json' which was not in request.tools",
      failed_generation: '{"name": "json", "arguments": {"message":"Confirma","ui":[{"type":"form","action":"transfer_funds","fields":[]}]}}',
    },
  });
  const recovered = extractFailedGeneration(body);
  assert.ok(recovered);
  const parsed = parseUiJson(recovered);
  assert.equal(parsed.message, 'Confirma');
  assert.equal(parsed.ui[0].type, 'form');
});

test('extractFailedGeneration acepta failed_generation que ya es la UI en JSON', () => {
  const body = JSON.stringify({
    error: { code: 'tool_use_failed', failed_generation: '{"message":"ok","ui":[{"type":"alert","text":"x"}]}' },
  });
  const parsed = parseUiJson(extractFailedGeneration(body));
  assert.equal(parsed.ui[0].type, 'alert');
});

test('extractFailedGeneration devuelve null para otros errores o contenido irrecuperable', () => {
  assert.equal(extractFailedGeneration('no json'), null);
  assert.equal(extractFailedGeneration(JSON.stringify({ error: { code: 'rate_limit', failed_generation: '{}' } })), null);
  assert.equal(extractFailedGeneration(JSON.stringify({ error: { code: 'tool_use_failed', failed_generation: 'texto sin json' } })), null);
});

test('createGroqProvider exige API key y expone nombre y modelo', () => {
  assert.throws(() => createGroqProvider({ apiKey: '' }), /GROQ_API_KEY/);
  const provider = createGroqProvider({ apiKey: 'k', model: 'm-1' });
  assert.equal(provider.name, 'groq');
  assert.equal(provider.model, 'm-1');
  assert.equal(createGroqProvider({ apiKey: 'k', model: undefined }).model, process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL);
});

test('chat envía modelo, mensajes y tools, y devuelve el mensaje del asistente', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(200, { choices: [{ message: { role: 'assistant', content: '{"message":"ok","ui":[]}' } }] }),
  ]);
  const provider = createGroqProvider({ apiKey: 'k', model: 'm-1', fetchImpl: impl, sleep: noSleep });
  const tools = [{ type: 'function', function: { name: 'get_accounts', parameters: {} } }];
  const msg = await provider.chat({ messages: [{ role: 'user', content: 'hola' }], tools });
  assert.equal(msg.content, '{"message":"ok","ui":[]}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'm-1');
  assert.equal(calls[0].body.tool_choice, 'auto');
  assert.deepEqual(calls[0].body.tools, tools);
});

test('chat reintenta ante 429 respetando el "try again in Ns" y avisa por onRateLimit', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(429, 'Rate limit reached. Please try again in 2.5s.'),
    jsonResponse(200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
  ]);
  const waits = [];
  const provider = createGroqProvider({
    apiKey: 'k', fetchImpl: impl, sleep: async (ms) => { waits.push(ms); },
  });
  const notices = [];
  const msg = await provider.chat({ messages: [], tools: [], onRateLimit: (s, attempt) => notices.push([s, attempt]) });
  assert.equal(msg.content, 'ok');
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [3500]);
  assert.deepEqual(notices, [[3.5, 1]]);
});

test('chat rescata la UI cuando Groq responde 400 con failed_generation', async () => {
  const { impl } = fakeFetch([
    jsonResponse(400, { error: { code: 'tool_use_failed', failed_generation: '{"message":"r","ui":[{"type":"text","markdown":"x"}]}' } }),
  ]);
  const provider = createGroqProvider({ apiKey: 'k', fetchImpl: impl, sleep: noSleep });
  const msg = await provider.chat({ messages: [], tools: [] });
  assert.equal(msg.role, 'assistant');
  assert.equal(parseUiJson(msg.content).ui[0].type, 'text');
});

test('chat lanza un error con el status ante respuestas no recuperables', async () => {
  const { impl } = fakeFetch([jsonResponse(500, 'boom')]);
  const provider = createGroqProvider({ apiKey: 'k', fetchImpl: impl, sleep: noSleep });
  await assert.rejects(() => provider.chat({ messages: [], tools: [] }), /Groq API 500: boom/);
});

test('getLlmProvider usa groq por defecto y rechaza proveedores desconocidos', () => {
  assert.deepEqual(availableProviders(), ['groq']);
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'k';
  try {
    assert.equal(getLlmProvider().name, 'groq');
    assert.equal(getLlmProvider('groq').name, 'groq');
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
  assert.throws(() => getLlmProvider('oracle'), /LLM_PROVIDER desconocido/);
});

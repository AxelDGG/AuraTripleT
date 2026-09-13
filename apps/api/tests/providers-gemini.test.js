import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_DEFAULT_MODEL,
  createGeminiProvider,
  fromGeminiResponse,
  sanitizeSchema,
  toGeminiRequest,
} from '../src/providers/gemini.js';
import { availableProviders, getLlmProvider } from '../src/providers/index.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => body,
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return responses.shift();
  };
  return { impl, calls };
}

const noSleep = async () => {};

test('gemini está registrado como proveedor y exige API key', () => {
  assert.deepEqual(availableProviders(), ['groq', 'gemini']);
  assert.throws(() => createGeminiProvider({ apiKey: '' }), /GEMINI_API_KEY/);
  const provider = createGeminiProvider({ apiKey: 'k' });
  assert.equal(provider.name, 'gemini');
  assert.equal(provider.model, process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL);
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'k';
  assert.equal(getLlmProvider('gemini').name, 'gemini');
});

test('sanitizeSchema deja el subconjunto OpenAPI que Gemini acepta y vuelve nullable los tipos con null', () => {
  const schema = sanitizeSchema({
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    properties: {
      accountId: { type: ['string', 'null'], description: 'ID' },
      limit: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      months: { type: 'integer', minimum: 1, format: 'int64' },
      tags: { type: 'array', items: { type: 'string', format: 'uuid' } },
      raro: { format: 'binary' },
    },
    required: ['months'],
  });
  assert.equal(schema.$schema, undefined);
  assert.equal(schema.additionalProperties, undefined);
  assert.deepEqual(schema.properties.accountId, { type: 'string', description: 'ID', nullable: true });
  assert.deepEqual(schema.properties.limit, { type: 'number', nullable: true });
  assert.deepEqual(schema.properties.months, { type: 'integer', minimum: 1, format: 'int64' });
  assert.deepEqual(schema.properties.tags, { type: 'array', items: { type: 'string' } });
  assert.equal(schema.properties.raro.type, 'string');
  assert.deepEqual(schema.required, ['months']);
  assert.deepEqual(sanitizeSchema(undefined), { type: 'object', properties: {} });
});

test('toGeminiRequest traduce system, user, assistant con tool_calls y respuestas de tools', () => {
  const request = toGeminiRequest({
    messages: [
      { role: 'system', content: 'Eres Norte.' },
      { role: 'system', content: 'SUPERFICIE ACTIVA: s1' },
      { role: 'user', content: 'mis cuentas' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_accounts', arguments: '{}' } }, { id: 'c2', type: 'function', function: { name: 'get_transactions', arguments: '{"limit":3}' } }] },
      { role: 'tool', tool_call_id: 'c1', name: 'get_accounts', content: '[{"id":"ACC-001"}]' },
      { role: 'tool', tool_call_id: 'c2', name: 'get_transactions', content: 'texto suelto' },
      { role: 'assistant', content: '{"message":"ok"}' },
    ],
    tools: [{ type: 'function', function: { name: 'get_accounts', description: 'Cuentas', parameters: { type: 'object', properties: {}, $schema: 'x' } } }],
  });
  assert.equal(request.systemInstruction.parts[0].text, 'Eres Norte.\n\nSUPERFICIE ACTIVA: s1');
  assert.deepEqual(request.contents.map((c) => c.role), ['user', 'model', 'user', 'model']);
  assert.deepEqual(request.contents[1].parts, [
    { functionCall: { id: 'c1', name: 'get_accounts', args: {} } },
    { functionCall: { id: 'c2', name: 'get_transactions', args: { limit: 3 } } },
  ]);
  // Las dos respuestas de tools van en un solo turno de usuario, con su id.
  assert.deepEqual(request.contents[2].parts, [
    { functionResponse: { id: 'c1', name: 'get_accounts', response: { result: [{ id: 'ACC-001' }] } } },
    { functionResponse: { id: 'c2', name: 'get_transactions', response: { result: 'texto suelto' } } },
  ]);
  assert.deepEqual(request.contents[3].parts, [{ text: '{"message":"ok"}' }]);
  assert.equal(request.tools[0].functionDeclarations[0].name, 'get_accounts');
  assert.equal(request.tools[0].functionDeclarations[0].parameters.$schema, undefined);
  assert.equal(request.generationConfig.temperature, 0.3);
});

test('el turno del modelo se reproduce íntegro (thoughtSignature incluida) cuando viene de Gemini', () => {
  const parts = [{ functionCall: { id: 'call_1', name: 'get_accounts', args: {} }, thoughtSignature: 'firma' }];
  const assistant = fromGeminiResponse({ candidates: [{ content: { role: 'model', parts } }] });
  assert.deepEqual(assistant.tool_calls, [{ id: 'call_1', type: 'function', function: { name: 'get_accounts', arguments: '{}' } }]);
  assert.equal(assistant.content, null);
  const request = toGeminiRequest({ messages: [{ role: 'user', content: 'x' }, assistant], tools: [] });
  assert.deepEqual(request.contents[1], { role: 'model', parts });
  assert.equal(request.tools, undefined);
});

test('fromGeminiResponse junta el texto (sin pensamientos) y falla con claridad si no hay candidatos', () => {
  const message = fromGeminiResponse({
    candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: '{"message":' }, { text: '"ok"}' }] } }],
  });
  assert.equal(message.content, '{"message":"ok"}');
  assert.equal(message.tool_calls, undefined);
  assert.throws(() => fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
});

test('chat manda la key en x-goog-api-key al endpoint del modelo y devuelve el mensaje traducido', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"message":"hola","ui":[]}' }] } }] }),
  ]);
  const provider = createGeminiProvider({ apiKey: 'k', model: 'gemini-x', fetchImpl: impl, sleep: noSleep });
  const msg = await provider.chat({ messages: [{ role: 'user', content: 'hola' }], tools: [] });
  assert.equal(msg.content, '{"message":"hola","ui":[]}');
  assert.match(calls[0].url, /\/models\/gemini-x:generateContent$/);
  assert.equal(calls[0].headers['x-goog-api-key'], 'k');
  assert.equal(calls[0].body.contents[0].parts[0].text, 'hola');
});

test('chat reintenta ante 429 con el retryDelay de Gemini y se rinde si la espera es de minutos', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '4s' }] } }),
    jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
  ]);
  const waits = [];
  const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: impl, sleep: async (ms) => { waits.push(ms); } });
  const notices = [];
  const msg = await provider.chat({ messages: [], tools: [], onRateLimit: (s, attempt) => notices.push([s, attempt]) });
  assert.equal(msg.content, 'ok');
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [5000]);
  assert.deepEqual(notices, [[5, 1]]);

  const slow = fakeFetch([jsonResponse(429, { error: { details: [{ retryDelay: '900s' }] } })]);
  const stuck = createGeminiProvider({ apiKey: 'k', fetchImpl: slow.impl, sleep: noSleep });
  await assert.rejects(() => stuck.chat({ messages: [], tools: [] }), /límite de cuota.*16 min/);
});

test('chat propaga otros errores HTTP con el cuerpo', async () => {
  const { impl } = fakeFetch([jsonResponse(400, { error: { message: 'Invalid JSON payload' } })]);
  const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: impl, sleep: noSleep });
  await assert.rejects(() => provider.chat({ messages: [], tools: [] }), /Gemini API 400.*Invalid JSON payload/);
});

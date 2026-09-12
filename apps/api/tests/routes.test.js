// Pruebas HTTP de la API: levanta la app en un puerto efímero con un agente
// falso (sin LLM real) y el servidor MCP real por stdio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { getMcpClient } from '../src/mcp-client.js';
import { createRateLimiter } from '../src/middleware/rate-limit.js';
import { createMemoryHistoryStore } from '../src/history-store.js';

let server;
let baseUrl;
let lastAgentInput;
let historyStore;

async function fakeAgent({ userMessage, history, emit }) {
  lastAgentInput = { userMessage, history };
  emit({ type: 'status', text: 'pensando' });
  emit({ type: 'ui', message: 'ok', title: 'Prueba', folder: 'gastos', ui: [{ type: 'text', markdown: userMessage }] });
  return { message: 'ok', ui: [] };
}

before(async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
  historyStore = createMemoryHistoryStore();
  const app = createApp({ agent: fakeAgent, historyStore });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const client = await getMcpClient();
  await client.close();
});

const postJson = (path, body) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const sseEvents = (text) =>
  text.split('\n\n').filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, '')));

test('GET /api/health reporta MCP conectado y el proveedor LLM', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mcp, 'connected');
  assert.equal(body.llm.provider, 'groq');
  assert.equal(body.llm.configured, true);
  assert.equal(body.model, body.llm.model);
});

test('respuestas llevan cabeceras de seguridad y CORS abierto para la app móvil', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const preflight = await fetch(`${baseUrl}/api/chat`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
});

test('GET / sirve la UI web de @norte/web', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /HISTORIAL DE VISUALIZACIÓN FINANCIERA INTELIGENTE/);
});

test('GET /api/dashboard agrega las 12 llamadas MCP en un solo payload', async () => {
  const res = await fetch(`${baseUrl}/api/dashboard`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(Object.keys(body.data).length, 12);
  assert.equal(body.data.accounts.length, 3);
  assert.equal(body.data.customer.id, 'CLT-889201');
});

test('POST /api/simulate-credit valida la entrada y delega en la tool MCP', async () => {
  const bad = await postJson('/api/simulate-credit', { productId: 'CRED-PERS', amount: 'mucho' });
  assert.equal(bad.status, 400);

  const ok = await postJson('/api/simulate-credit', { productId: 'CRED-PERS', amount: 80000, months: 24 });
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.data.monthlyPayment > 0);

  const unknown = await postJson('/api/simulate-credit', { productId: 'CRED-NOPE', amount: 1000, months: 12 });
  const unknownBody = await unknown.json();
  assert.equal(unknownBody.ok, false);
  assert.match(unknownBody.error, /Producto no encontrado/);
});

test('GET /api/customer resuelve el perfil con una sola llamada MCP', async () => {
  const res = await fetch(`${baseUrl}/api/customer`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.data.name);
  assert.ok(body.data.segment);
});

test('POST /api/chat rechaza mensajes vacíos o demasiado largos', async () => {
  assert.equal((await postJson('/api/chat', {})).status, 400);
  assert.equal((await postJson('/api/chat', { message: '   ' })).status, 400);
  assert.equal((await postJson('/api/chat', { message: 'x'.repeat(4001) })).status, 400);
});

test('POST /api/chat transmite los eventos del agente por SSE y cierra con done', async () => {
  const res = await postJson('/api/chat', {
    message: '  hola  ',
    history: [
      { role: 'user', content: 'antes' },
      { role: 'system', content: 'inyectado' },
      { role: 'assistant', content: 42 },
      { role: 'assistant', content: 'respuesta' },
    ],
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const events = sseEvents(await res.text());
  assert.deepEqual(events.map((e) => e.type), ['status', 'ui', 'history', 'done']);
  assert.equal(events[1].ui[0].markdown, 'hola');
  assert.equal(lastAgentInput.userMessage, 'hola');
  assert.deepEqual(lastAgentInput.history, [
    { role: 'user', content: 'antes' },
    { role: 'assistant', content: 'respuesta' },
  ]);
});

test('la interfaz generada se archiva con la carpeta que eligió la IA', async () => {
  await postJson('/api/chat', { message: '¿cuánto gasté?' });
  const [ultima] = await historyStore.list({ limit: 1 });
  assert.equal(ultima.folder, 'gastos');
  assert.equal(ultima.title, 'Prueba');
  assert.equal(ultima.prompt, '¿cuánto gasté?');
  assert.equal(ultima.spec.ui[0].markdown, '¿cuánto gasté?');

  const res = await fetch(`${baseUrl}/api/history?folder=gastos`);
  assert.ok((await res.json()).entries.some((e) => e.prompt === '¿cuánto gasté?'));
});

test('el aviso de error del agente no ensucia el historial', async () => {
  const store = createMemoryHistoryStore();
  const app = createApp({
    agent: async ({ emit }) => {
      emit({ type: 'ui', message: 'no pude', title: 'Sin respuesta del agente', folder: 'otros', ui: [], fallback: true });
    },
    historyStore: store,
  });
  const s = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hola' }),
    });
    assert.deepEqual(sseEvents(await res.text()).map((e) => e.type), ['ui', 'done']);
    assert.equal((await store.list()).length, 0);
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

test('POST /api/chat convierte un fallo del agente en un evento error sin tumbar el stream', async () => {
  const app = createApp({ agent: async () => { throw new Error('LLM caído'); } });
  const failing = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${failing.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hola' }),
    });
    const events = sseEvents(await res.text());
    assert.deepEqual(events.map((e) => e.type), ['error', 'done']);
    assert.match(events[0].text, /LLM caído/);
  } finally {
    await new Promise((resolve) => failing.close(resolve));
  }
});

test('un body JSON malformado responde 400 sin exponer detalles internos', async () => {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message": ',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Solicitud inválida.' });
});

test('createRateLimiter deja pasar hasta el máximo por ventana y luego responde 429', () => {
  const limiter = createRateLimiter(2, { windowMs: 60_000 });
  const req = { ip: '1.2.3.4' };
  const outcomes = [];
  const res = { status(code) { outcomes.push(code); return this; }, json() {} };
  const next = () => outcomes.push('next');
  limiter(req, res, next);
  limiter(req, res, next);
  limiter(req, res, next);
  assert.deepEqual(outcomes, ['next', 'next', 429]);
  limiter({ ip: '5.6.7.8' }, res, next);
  assert.equal(outcomes.at(-1), 'next');
});

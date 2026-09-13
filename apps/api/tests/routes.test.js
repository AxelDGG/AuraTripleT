// Pruebas HTTP de la API: levanta la app en un puerto efímero con un agente
// falso (sin LLM real) y el servidor MCP real por stdio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { getMcpClient } from '../src/mcp-client.js';
import { createRateLimiter } from '../src/middleware/rate-limit.js';
import { createMemoryHistoryStore } from '../src/history-store.js';
import { createInMemoryMemoryStore } from '../src/memory-store.js';

let server;
let baseUrl;
let lastAgentInput;
let historyStore;
let memoryStore;

async function fakeAgent({ userMessage, history, emit, action, surface, client, memories }) {
  lastAgentInput = { userMessage, history, action, surface, client, memories };
  emit({ type: 'status', text: 'pensando' });
  emit({ type: 'ui', message: 'ok', title: 'Prueba', folder: 'gastos', ui: [{ type: 'text', markdown: userMessage }] });
  return { message: 'ok', ui: [] };
}

// Extractor falso: "recuerda que ..." se vuelve un hecho; lo demás, nada.
const fakeExtractor = {
  async extract({ userMessage }) {
    const match = /recuerda que (.+)/i.exec(userMessage);
    return match ? [{ kind: 'preference', content: match[1].trim() }] : [];
  },
};

before(async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
  historyStore = createMemoryHistoryStore();
  memoryStore = createInMemoryMemoryStore();
  const app = createApp({ agent: fakeAgent, historyStore, memoryStore, memoryExtractor: fakeExtractor });
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

test('GET / sirve la portada de banca en línea de @norte/web', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Banorte · Banca en línea<\/title>/);
  assert.match(html, /id="movements"/);
});

test('GET /asistente sirve la UI del agente y GET /login la pantalla de acceso', async () => {
  const [assistant, login] = await Promise.all([
    fetch(`${baseUrl}/asistente`).then((res) => res.text()),
    fetch(`${baseUrl}/login`).then((res) => res.text()),
  ]);
  assert.match(assistant, /<title>Banorte · Agente de visualización financiera<\/title>/);
  assert.match(assistant, /id="canvas"/);
  assert.match(login, /<title>Banorte · Inicia sesión<\/title>/);
  assert.match(login, /id="loginForm"/);
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

test('la memoria del agente aprende del turno, se recupera en el siguiente y se puede listar y borrar', async () => {
  // Turno 1: no hay memorias todavía; el extractor guarda una al cerrar.
  const first = await postJson('/api/chat', { message: 'recuerda que prefiero plazos cortos' });
  const firstEvents = sseEvents(await first.text());
  assert.deepEqual(lastAgentInput.memories, []);
  const learned = firstEvents.find((e) => e.type === 'memory' && e.learned);
  assert.deepEqual(learned.learned, ['prefiero plazos cortos']);
  assert.equal(firstEvents.at(-1).type, 'done');

  // Turno 2: la memoria llega al agente y el cliente ve qué se usó.
  const second = await postJson('/api/chat', { message: 'quiero reestructurar mi tarjeta' });
  const secondEvents = sseEvents(await second.text());
  assert.deepEqual(lastAgentInput.memories.map((m) => m.content), ['prefiero plazos cortos']);
  assert.deepEqual(secondEvents.find((e) => e.type === 'memory').used, ['prefiero plazos cortos']);
  assert.ok(!secondEvents.some((e) => e.type === 'memory' && e.learned), 'sin hechos nuevos no se emite learned');

  // Transparencia: se lista y se borra.
  const list = await (await fetch(`${baseUrl}/api/memory`)).json();
  assert.equal(list.enabled, true);
  assert.equal(list.kind, 'memory');
  assert.equal(list.memories.length, 1);
  assert.equal(list.memories[0].uses, 1);
  const del = await fetch(`${baseUrl}/api/memory/${list.memories[0].id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/memory`)).json()).memories.length, 0);
  assert.equal((await fetch(`${baseUrl}/api/memory/no-existe`, { method: 'DELETE' })).status, 404);
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

// ---------- Norte A2UI v2 ----------

test('GET /api/a2ui/catalog publica el catálogo de componentes y las renderer functions', async () => {
  const res = await fetch(`${baseUrl}/api/a2ui/catalog`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.version, 'v1.0');
  assert.match(body.catalogId, /^urn:norte:a2ui:catalog/);
  assert.ok(body.components.some((c) => c.name === 'Slider'));
  assert.ok(body.functions.includes('amortize'));
});

test('el núcleo A2UI se sirve como módulos ES en /a2ui/*.js', async () => {
  const res = await fetch(`${baseUrl}/a2ui/runtime.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(await res.text(), /export function createSurfaceStore/);
});

test('POST /api/chat pasa la superficie activa y las capacidades del cliente al agente', async () => {
  const res = await postJson('/api/chat', {
    message: '¿y a 6 meses?',
    surface: { surfaceId: 's_1', title: 'Plan', dataModel: { plan: { months: 12 } }, components: 'no se manda' },
    client: { platform: 'web', components: ['Kpi', 'Slider', 42] },
  });
  assert.equal(res.status, 200);
  await res.text();
  assert.deepEqual(lastAgentInput.surface, { surfaceId: 's_1', title: 'Plan', dataModel: { plan: { months: 12 } } });
  assert.deepEqual(lastAgentInput.client, { platform: 'web', components: ['Kpi', 'Slider'] });
  assert.equal(lastAgentInput.action, null);
});

test('POST /api/action valida el evento tipado y lo entrega al agente como [action:nombre]', async () => {
  const bad = await postJson('/api/action', { surfaceId: 's', event: { name: 'rm -rf' } });
  assert.equal(bad.status, 400);

  const res = await postJson('/api/action', {
    surfaceId: 's_1',
    event: { name: 'confirm_restructure', context: { accountId: 'ACC-003', months: 12 } },
    dataModel: { plan: { months: 12 } },
  });
  assert.equal(res.status, 200);
  const events = sseEvents(await res.text());
  assert.deepEqual(events.map((e) => e.type), ['status', 'ui', 'history', 'done']);
  assert.equal(lastAgentInput.userMessage, '[action:confirm_restructure] {"accountId":"ACC-003","months":12}');
  assert.equal(lastAgentInput.action.event.name, 'confirm_restructure');
  assert.deepEqual(lastAgentInput.action.dataModel, { plan: { months: 12 } });
});

test('un patch no se archiva en el historial', async () => {
  const store = createMemoryHistoryStore();
  const app = createApp({
    agent: async ({ emit }) => {
      emit({ type: 'ui', patch: true, surfaceId: 's', updates: [{ path: '/a', value: 1 }], message: 'cambió', title: 'x', folder: 'otros', ui: [] });
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

test('la superficie generada se archiva junto con la proyección v1', async () => {
  const store = createMemoryHistoryStore();
  const surface = { surfaceId: 's_9', components: [{ id: 'root', component: 'Stack', children: [] }], dataModel: { a: 1 } };
  const app = createApp({
    agent: async ({ emit }) => {
      emit({ type: 'ui', surfaceId: 's_9', surface, message: 'm', title: 'Con superficie', folder: 'gastos', ui: [{ type: 'text', markdown: 'm' }] });
    },
    historyStore: store,
  });
  const s = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  try {
    await fetch(`http://127.0.0.1:${s.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hola' }),
    }).then((r) => r.text());
    const [entry] = await store.list();
    assert.deepEqual(entry.spec.surface, surface);
    assert.equal(entry.spec.ui[0].type, 'text');
    const listed = await (await fetch(`http://127.0.0.1:${s.address().port}/api/history`)).json();
    assert.equal(listed.entries[0].spec.surface.surfaceId, 's_9', 'una entrada con superficie no se vuelve a elevar');
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

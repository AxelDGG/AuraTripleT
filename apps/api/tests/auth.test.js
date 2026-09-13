// Pruebas de la capa de sesión: firma de tokens, verificación de credenciales
// y las tres rutas de /api/auth. No hay LLM ni base de datos de por medio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { getMcpClient } from '../src/mcp-client.js';
import { createMemoryHistoryStore } from '../src/history-store.js';
import { issueToken, verifyToken, resetSecretCache } from '../src/auth/tokens.js';
import { verifyCredentials, publicUser } from '../src/auth/users.js';

let server;
let baseUrl;

const fakeAgent = async ({ emit }) => {
  emit({ type: 'ui', message: 'ok', title: 'Prueba', folder: 'gastos', ui: [{ type: 'text', markdown: 'hola' }] });
};

before(async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
  process.env.AUTH_SECRET = 'secreto-de-pruebas-suficientemente-largo';
  resetSecretCache();
  const app = createApp({ agent: fakeAgent, historyStore: createMemoryHistoryStore() });
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

const login = (body) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------- tokens ----------

test('un token firmado se verifica y trae sus claims', () => {
  const { token, expiresAt } = issueToken({ sub: 'USR-001', cid: 'CLT-889201' });
  const claims = verifyToken(token);
  assert.equal(claims.sub, 'USR-001');
  assert.equal(claims.cid, 'CLT-889201');
  assert.ok(new Date(expiresAt).getTime() > Date.now());
});

test('un token con la firma alterada se rechaza', () => {
  const { token } = issueToken({ sub: 'USR-001' });
  const [payload, signature] = token.split('.');
  const tampered = `${payload}.${signature.slice(0, -2)}xy`;
  assert.equal(verifyToken(tampered), null);
});

test('un token con el payload alterado se rechaza', () => {
  const { token } = issueToken({ sub: 'USR-001' });
  const forged = Buffer.from(JSON.stringify({ sub: 'USR-999', exp: 9e9 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${token.split('.')[1]}`), null);
});

test('un token expirado se rechaza', () => {
  const { token } = issueToken({ sub: 'USR-001' }, { ttlHours: -1 });
  assert.equal(verifyToken(token), null);
});

test('basura no tumba al verificador', () => {
  for (const value of [null, undefined, '', 'a.b.c', 'sin-punto', 42, {}]) {
    assert.equal(verifyToken(value), null);
  }
});

// ---------- credenciales ----------

test('las credenciales correctas devuelven al usuario y las malas no', async () => {
  const user = await verifyCredentials('regina', 'Banorte2026');
  assert.equal(user.id, 'USR-001');
  assert.equal(user.customerId, 'CLT-889201');
  assert.equal(await verifyCredentials('regina', 'incorrecta'), null);
  assert.equal(await verifyCredentials('no-existe', 'Banorte2026'), null);
});

test('la forma pública del usuario nunca incluye el hash', async () => {
  const user = await verifyCredentials('regina', 'Banorte2026');
  const safe = publicUser(user);
  assert.equal(safe.passwordHash, undefined);
  assert.equal(safe.preferredName, 'Regina');
});

// ---------- rutas ----------

test('POST /api/auth/login entrega token y usuario', async () => {
  const res = await login({ username: 'regina', password: 'Banorte2026', channel: 'mobile' });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user.preferredName, 'Regina');
  assert.equal(body.user.customerId, 'CLT-889201');
  assert.ok(verifyToken(body.token));
});

test('POST /api/auth/login rechaza credenciales inválidas con 401', async () => {
  const res = await login({ username: 'regina', password: 'nope' });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).ok, false);
});

test('POST /api/auth/login exige ambos campos', async () => {
  assert.equal((await login({ username: 'regina' })).status, 400);
  assert.equal((await login({})).status, 400);
});

test('GET /api/auth/session valida el token y 401 sin él', async () => {
  const { token } = await (await login({ username: 'carlos', password: 'Banorte2026' })).json();
  const ok = await fetch(`${baseUrl}/api/auth/session`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).user.preferredName, 'Carlos');

  assert.equal((await fetch(`${baseUrl}/api/auth/session`)).status, 401);
  const bad = await fetch(`${baseUrl}/api/auth/session`, { headers: { Authorization: 'Bearer basura' } });
  assert.equal(bad.status, 401);
});

test('el segundo login reporta el ingreso anterior', async () => {
  await (await login({ username: 'maria', password: 'Banorte2026' })).json();
  const second = await (await login({ username: 'maria', password: 'Banorte2026', channel: 'mobile' })).json();
  assert.ok(second.user.lastLogin);
  assert.ok(new Date(second.user.lastLogin.at).getTime() <= Date.now());
});

test('GET /api/customer agrega el nombre de la sesión cuando hay token', async () => {
  const { token } = await (await login({ username: 'regina', password: 'Banorte2026' })).json();
  const withSession = await (
    await fetch(`${baseUrl}/api/customer`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  assert.equal(withSession.data.preferredName, 'Regina');

  // Sin token la respuesta sigue siendo la de siempre: la web no se rompe.
  const anonymous = await (await fetch(`${baseUrl}/api/customer`)).json();
  assert.equal(anonymous.data.preferredName, undefined);
  assert.ok(anonymous.data.name);
});

test('GET /api/overview exige sesión y arma la portada', async () => {
  assert.equal((await fetch(`${baseUrl}/api/overview`)).status, 401);

  const { token } = await (await login({ username: 'maria', password: 'Banorte2026' })).json();
  const res = await fetch(`${baseUrl}/api/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);

  const { data } = await res.json();
  assert.equal(data.user.preferredName, 'María Fernanda');
  assert.ok(data.accounts.length > 0);
  assert.ok(data.transactions.length > 0);
  assert.ok(data.favorites.length > 0);
  // El saldo de la cuenta de nómina es lo que encabeza la portada.
  assert.ok(data.accounts.some((account) => account.type === 'checking'));
  // Las alertas se derivan de los datos, así que traen nivel y título siempre.
  for (const alert of data.alerts) {
    assert.ok(['critical', 'warn', 'info', 'ok'].includes(alert.level));
    assert.ok(alert.title);
  }
});

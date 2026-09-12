// Historial de visualizaciones: store en memoria (el fallback de la demo) y la
// ruta GET /api/history. La variante Tiger usa el mismo contrato y se prueba
// contra la base real con `npm run db:verify`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHistoryStore, createMemoryHistoryStore } from '../src/history-store.js';
import { createHistoryRouter } from '../src/routes/history.js';

const spec = (text) => ({ message: text, ui: [{ type: 'text', markdown: text }] });

test('sin DATABASE_URL el store cae a memoria y lo avisa', () => {
  const avisos = [];
  const store = createHistoryStore({ connectionString: '', logger: (msg) => avisos.push(msg) });
  assert.equal(store.kind, 'memory');
  assert.match(avisos[0], /Sin DATABASE_URL/);
});

test('con DATABASE_URL el store es el de Tiger (sin conectarse todavía)', () => {
  const store = createHistoryStore({ connectionString: 'postgres://u:p@ejemplo:5432/db' });
  assert.equal(store.kind, 'tiger');
});

test('add normaliza la carpeta, rellena el título y devuelve lo guardado', async () => {
  const store = createMemoryHistoryStore();
  const entry = await store.add({ folder: 'TRANSFERENCIAS', title: '  Pago a Juan  ', prompt: 'p', message: 'm', spec: spec('x') });
  assert.equal(entry.folder, 'transacciones');
  assert.equal(entry.title, 'Pago a Juan');
  assert.deepEqual(entry.spec, spec('x'));
  assert.ok(entry.id && entry.createdAt);

  const sinTitulo = await store.add({ folder: 'inventada', title: '   ', spec: spec('y') });
  assert.equal(sinTitulo.folder, 'otros');
  assert.equal(sinTitulo.title, 'Visualización');
  assert.equal(sinTitulo.prompt, null);
});

test('list devuelve de más reciente a más antiguo y filtra por carpeta y título', async () => {
  const store = createMemoryHistoryStore();
  await store.add({ folder: 'gastos', title: 'Gastos de agosto', spec: spec('a') });
  await store.add({ folder: 'movimientos', title: 'Saldo de nómina', spec: spec('b') });
  await store.add({ folder: 'gastos', title: 'Gastos de julio', spec: spec('c') });

  assert.deepEqual((await store.list()).map((e) => e.title), ['Gastos de julio', 'Saldo de nómina', 'Gastos de agosto']);
  assert.deepEqual((await store.list({ folder: 'gastos' })).map((e) => e.title), ['Gastos de julio', 'Gastos de agosto']);
  assert.deepEqual((await store.list({ search: 'AGOSTO' })).map((e) => e.title), ['Gastos de agosto']);
  assert.equal((await store.list({ limit: 1 })).length, 1);
  assert.equal((await store.list({ folder: 'promociones' })).length, 0);
});

test('counts reporta las cinco carpetas, incluso las vacías', async () => {
  const store = createMemoryHistoryStore();
  await store.add({ folder: 'gastos', title: 'A', spec: spec('a') });
  await store.add({ folder: 'gastos', title: 'B', spec: spec('b') });
  assert.deepEqual(await store.counts(), {
    transacciones: 0, promociones: 0, movimientos: 0, gastos: 2, otros: 0,
  });
});

// ===== Ruta HTTP =====

let server;
let baseUrl;
let store;

before(async () => {
  store = createMemoryHistoryStore();
  const app = express();
  app.use(createHistoryRouter({ historyStore: store }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await store.add({ folder: 'gastos', title: 'Gastos de agosto', prompt: '¿en qué gasté?', spec: spec('a') });
  await store.add({ folder: 'transacciones', title: 'Transferencia a Juan', prompt: 'manda 500', spec: spec('b') });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/history devuelve las entradas y el conteo de las cinco carpetas', async () => {
  const res = await fetch(`${baseUrl}/api/history`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.source, 'memory');
  assert.deepEqual(body.folders.map((f) => f.id), ['transacciones', 'promociones', 'movimientos', 'gastos', 'otros']);
  assert.deepEqual(body.folders.map((f) => f.total), [1, 0, 0, 1, 0]);
  assert.deepEqual(body.entries.map((e) => e.title), ['Transferencia a Juan', 'Gastos de agosto']);
  assert.deepEqual(body.entries[0].spec, spec('b'));
});

test('GET /api/history filtra por carpeta y por búsqueda de título', async () => {
  const porCarpeta = await (await fetch(`${baseUrl}/api/history?folder=gastos`)).json();
  assert.deepEqual(porCarpeta.entries.map((e) => e.title), ['Gastos de agosto']);
  // Los conteos son del total, no del filtro: las tarjetas no cambian de número
  // al abrir una carpeta.
  assert.deepEqual(porCarpeta.folders.map((f) => f.total), [1, 0, 0, 1, 0]);

  const porTexto = await (await fetch(`${baseUrl}/api/history?search=juan`)).json();
  assert.deepEqual(porTexto.entries.map((e) => e.title), ['Transferencia a Juan']);
});

test('GET /api/history rechaza una carpeta que no existe', async () => {
  const res = await fetch(`${baseUrl}/api/history?folder=inventada`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Carpeta desconocida/);
});

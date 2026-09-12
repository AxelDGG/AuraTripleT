// Verifica contra la base real (DATABASE_URL) que el repositorio `tiger`
// devuelve exactamente lo mismo que `memory`, que la transferencia atómica
// funciona y que el historial de visualizaciones da la vuelta completa.
//
//   npm run db:verify
//
// Deja la base como la encontró: lo que escribe (una transferencia y una
// entrada de historial) lo borra al final.

import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

import { createTigerRepository } from '../packages/mcp-server/src/repositories/tiger.js';
import { pgConnectionOptions } from '@norte/mcp-server/pg-options';
import { createMemoryRepository } from '../packages/mcp-server/src/repositories/memory.js';
import { createHistoryStore } from '../apps/api/src/history-store.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Corre primero `npm run db:setup`.');
  process.exit(1);
}

const tiger = createTigerRepository({ connectionString });
const memory = createMemoryRepository();
const history = createHistoryStore({ connectionString });

let failures = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ok    ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FALLA ${label}`);
    console.log(`        ${err.message.split('\n').slice(0, 6).join('\n        ')}`);
  }
}

// deepEqual no depende del orden de las llaves de un objeto, pero sí del orden
// de los arreglos: es justo lo que queremos comprobar.
const same = (label, fn) => check(label, async () => assert.deepEqual(await fn(tiger), await fn(memory)));

console.log('\nParidad tiger vs memory');
await same('getCustomer', (r) => r.getCustomer());
await same('listAccounts', (r) => r.listAccounts());
await same('findAccount(ACC-003)', (r) => r.findAccount('ACC-003'));
await same('findAccount inexistente → null', (r) => r.findAccount('NO-EXISTE'));
await same('listTransactions', (r) => r.listTransactions());
await same('listTransactions por cuenta y límite', (r) => r.listTransactions({ accountId: 'ACC-001', limit: 5 }));
await same('listTransactions por categoría', (r) => r.listTransactions({ category: 'restaurantes' }));
await same('listInvestments', (r) => r.listInvestments());
await same('listExchangeRates.rates', async (r) => (await r.listExchangeRates()).rates);
await same('listBeneficiaries', (r) => r.listBeneficiaries());
await same('findBeneficiary(BEN-02)', (r) => r.findBeneficiary('BEN-02'));
await same('listCreditProducts', (r) => r.listCreditProducts());
await same('listHoldings', (r) => r.listHoldings());
await same('listWatchlist', (r) => r.listWatchlist());
await check('listExchangeRates.updatedAt es el mismo instante', async () => {
  const [t, m] = [await tiger.listExchangeRates(), await memory.listExchangeRates()];
  assert.equal(new Date(t.updatedAt).getTime(), new Date(m.updatedAt).getTime());
});

console.log('\nTransferencia atómica');
// Fotografía de los saldos para restaurarlos al final.
const snapshot = await tiger.listAccounts();
const beforeBalance = snapshot.find((a) => a.id === 'ACC-001').balance;
let transferIds = [];
await check('descuenta el origen y abona el destino', async () => {
  const result = await tiger.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: 'ACC-002', amount: 1000,
    date: '2026-09-12', debitDescription: 'Verificación', creditDescription: 'Verificación',
  });
  assert.equal(result.ok, true);
  transferIds = [result.debitTransactionId, result.creditTransactionId].filter(Boolean);
  assert.equal(result.newBalance, Math.round((beforeBalance - 1000) * 100) / 100);
});
await check('rechaza por saldo insuficiente sin mover nada', async () => {
  const before = (await tiger.findAccount('ACC-001')).balance;
  const result = await tiger.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: 'ACC-002', amount: 9e9,
    date: '2026-09-12', debitDescription: 'x', creditDescription: 'x',
  });
  assert.equal(result.reason, 'insufficient_funds');
  assert.equal((await tiger.findAccount('ACC-001')).balance, before);
});
await check('rechaza una cuenta inexistente', async () => {
  const result = await tiger.applyTransfer({
    fromAccountId: 'ACC-999', amount: 1, date: '2026-09-12', debitDescription: 'x', creditDescription: 'x',
  });
  assert.equal(result.reason, 'account_not_found');
});

console.log('\nHistorial de visualizaciones (hypertable ui_history)');
let historyId = null;
await check('guarda, lista, filtra por carpeta y cuenta', async () => {
  assert.equal(history.kind, 'tiger');
  const title = `Verificación ${Date.now()}`;
  const entry = await history.add({
    folder: 'GASTOS', title, prompt: 'verificación', message: 'm',
    spec: { message: 'm', ui: [{ type: 'text', markdown: 'hola' }] },
  });
  historyId = entry.id;
  assert.equal(entry.folder, 'gastos');
  assert.deepEqual(entry.spec.ui[0], { type: 'text', markdown: 'hola' });

  const [reciente] = await history.list({ limit: 1 });
  assert.equal(reciente.id, entry.id);
  assert.ok((await history.list({ folder: 'gastos' })).some((e) => e.id === entry.id));
  assert.ok((await history.list({ search: title.slice(0, 12) })).some((e) => e.id === entry.id));
  assert.ok((await history.counts()).gastos >= 1);
});

// ===== Limpieza: la base queda como estaba =====
const admin = new pg.Client(pgConnectionOptions(connectionString));
await admin.connect();
if (transferIds.length) {
  await admin.query('DELETE FROM transactions WHERE id = ANY($1)', [transferIds]);
  for (const account of snapshot) {
    await admin.query('UPDATE accounts SET balance = $2, available_balance = $3 WHERE id = $1', [
      account.id,
      account.balance,
      account.availableBalance ?? null,
    ]);
  }
}
if (historyId) await admin.query('DELETE FROM ui_history WHERE id = $1', [historyId]);
await admin.end();

await tiger.close();
await history.close();

console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} verificación(es) fallaron.`);
process.exitCode = failures === 0 ? 0 : 1;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, availableDataSources } from '../src/repositories/index.js';
import { createMemoryRepository } from '../src/repositories/memory.js';

test('createRepository usa memory por defecto y rechaza fuentes desconocidas', () => {
  assert.deepEqual(availableDataSources(), ['memory', 'tiger']);
  assert.equal(createRepository({ kind: undefined }).kind, 'memory');
  assert.equal(createRepository({ kind: 'memory' }).kind, 'memory');
  assert.throws(() => createRepository({ kind: 'oracle' }), /BANK_DATA_SOURCE desconocido/);
});

test('pedir tiger sin DATABASE_URL avisa y cae a memoria en vez de tumbar la demo', () => {
  const avisos = [];
  const repo = createRepository({ kind: 'tiger', connectionString: '', logger: (msg) => avisos.push(msg) });
  assert.equal(repo.kind, 'memory');
  assert.match(avisos[0], /falta DATABASE_URL/);
});

test('con DATABASE_URL, tiger construye el repositorio sin conectarse todavía', () => {
  // El Pool de pg es perezoso: crear el repositorio no abre conexión, así que
  // esto se puede probar sin una base real.
  const repo = createRepository({ kind: 'tiger', connectionString: 'postgres://u:p@ejemplo:5432/db' });
  assert.equal(repo.kind, 'tiger');
});

test('el repositorio en memoria devuelve copias, no referencias a su estado', async () => {
  const repo = createMemoryRepository();
  const account = await repo.findAccount('ACC-001');
  account.balance = -1;
  assert.notEqual((await repo.findAccount('ACC-001')).balance, -1);
  const [tx] = await repo.listTransactions({ limit: 1 });
  tx.amount = 0;
  assert.notEqual((await repo.listTransactions({ limit: 1 }))[0].amount, 0);
  assert.equal(await repo.findAccount('NO-EXISTE'), null);
  assert.equal(await repo.findBeneficiary('NO-EXISTE'), null);
  assert.equal(await repo.findCreditProduct('NO-EXISTE'), null);
});

test('listTransactions filtra, ordena y limita', async () => {
  const repo = createMemoryRepository();
  const all = await repo.listTransactions();
  assert.equal(all.length, 32);
  const limited = await repo.listTransactions({ limit: 3 });
  assert.equal(limited.length, 3);
  assert.deepEqual(limited, all.slice(0, 3));
  const byAccount = await repo.listTransactions({ accountId: 'ACC-002' });
  assert.ok(byAccount.length > 0 && byAccount.every((t) => t.accountId === 'ACC-002'));
  const byCategory = await repo.listTransactions({ category: 'SUPERMERCADO' });
  assert.ok(byCategory.length > 0 && byCategory.every((t) => t.category === 'Supermercado'));
});

test('applyTransfer descuenta origen, abona destino propio y genera ids consecutivos', async () => {
  const repo = createMemoryRepository();
  const fromBefore = await repo.findAccount('ACC-001');
  const toBefore = await repo.findAccount('ACC-002');

  const first = await repo.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: 'ACC-002', amount: 250.5, date: '2026-09-12',
    debitDescription: 'salida', creditDescription: 'entrada',
  });

  assert.equal(first.debitTransactionId, 'TX-1042');
  assert.equal(first.creditTransactionId, 'TX-1043');
  assert.equal(first.newBalance, Math.round((fromBefore.balance - 250.5) * 100) / 100);
  assert.equal((await repo.findAccount('ACC-002')).balance, Math.round((toBefore.balance + 250.5) * 100) / 100);
  const [newest, second] = await repo.listTransactions({ limit: 2 });
  assert.deepEqual([newest.id, second.id], ['TX-1043', 'TX-1042']);
  assert.equal(newest.description, 'entrada');

  const external = await repo.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: null, amount: 10, date: '2026-09-12',
    debitDescription: 'a tercero', creditDescription: 'n/a',
  });
  assert.equal(external.debitTransactionId, 'TX-1044');
  assert.equal(external.creditTransactionId, null);
});

test('applyTransfer no abona a una tarjeta de crédito como destino', async () => {
  const repo = createMemoryRepository();
  const creditBefore = await repo.findAccount('ACC-003');
  const result = await repo.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: 'ACC-003', amount: 100, date: '2026-09-12',
    debitDescription: 'pago tdc', creditDescription: 'n/a',
  });
  assert.equal(result.creditTransactionId, null);
  assert.equal((await repo.findAccount('ACC-003')).balance, creditBefore.balance);
});

test('applyTransfer rechaza saldo insuficiente y cuentas inexistentes sin tocar el estado', async () => {
  const repo = createMemoryRepository();
  const before = await repo.findAccount('ACC-001');
  const countBefore = (await repo.listTransactions()).length;

  const tooMuch = await repo.applyTransfer({
    fromAccountId: 'ACC-001', toAccountId: null, amount: before.availableBalance + 1, date: '2026-09-12',
    debitDescription: 'x', creditDescription: 'x',
  });
  assert.deepEqual(tooMuch, { ok: false, reason: 'insufficient_funds', availableBalance: before.availableBalance });

  const missing = await repo.applyTransfer({
    fromAccountId: 'NO-EXISTE', toAccountId: null, amount: 1, date: '2026-09-12',
    debitDescription: 'x', creditDescription: 'x',
  });
  assert.deepEqual(missing, { ok: false, reason: 'account_not_found' });

  assert.equal((await repo.findAccount('ACC-001')).balance, before.balance);
  assert.equal((await repo.listTransactions()).length, countBefore);
});

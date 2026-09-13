import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBankingTools, MAX_TRANSFER_AMOUNT } from '../src/tools.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import * as bankSeed from '../src/data/mockData.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Tools frescas sobre un repositorio en memoria nuevo por prueba.
const freshTools = (repoOptions) => {
  const repo = createMemoryRepository(repoOptions);
  return { repo, tools: createBankingTools(repo) };
};

const balanceOf = async (repo, id) => (await repo.findAccount(id)).balance;

test('getCustomerProfile devuelve el perfil del cliente', async () => {
  const { tools } = freshTools();
  const profile = await tools.getCustomerProfile();
  assert.equal(profile.name, 'María Fernanda López García');
  assert.ok(profile.creditScore > 0);
});

test('getAccounts devuelve las 3 cuentas con saldos', async () => {
  const { tools } = freshTools();
  const accounts = await tools.getAccounts();
  assert.equal(accounts.length, 3);
  assert.ok(accounts.every((a) => typeof a.balance === 'number'));
});

test('getTransactions filtra por cuenta y respeta el límite', async () => {
  const { tools } = freshTools();
  const txs = await tools.getTransactions({ accountId: 'ACC-003', limit: 5 });
  assert.ok(txs.length <= 5);
  assert.ok(txs.every((t) => t.accountId === 'ACC-003'));
});

test('getTransactions filtra por categoría sin distinguir mayúsculas', async () => {
  const { tools } = freshTools();
  const txs = await tools.getTransactions({ category: 'restaurantes' });
  assert.ok(txs.length > 0);
  assert.ok(txs.every((t) => t.category === 'Restaurantes'));
});

test('getTransactions ordena del más reciente al más antiguo', async () => {
  const { tools } = freshTools();
  const txs = await tools.getTransactions({ limit: 50 });
  for (let i = 1; i < txs.length; i++) {
    assert.ok(txs[i - 1].date >= txs[i].date);
  }
});

test('getSpendingByCategory suma solo cargos y ordena descendente', async () => {
  const { tools } = freshTools();
  const { categories, totalSpent } = await tools.getSpendingByCategory();
  assert.ok(categories.length > 0);
  assert.ok(totalSpent > 0);
  for (let i = 1; i < categories.length; i++) {
    assert.ok(categories[i - 1].total >= categories[i].total);
  }
  assert.equal(round2(categories.reduce((s, c) => s + c.total, 0)), totalSpent);
});

test('getMonthlyCashflow calcula neto = ingresos - gastos', async () => {
  const { tools } = freshTools();
  const months = await tools.getMonthlyCashflow();
  assert.ok(months.length >= 2);
  for (const m of months) {
    assert.equal(m.net, round2(m.income - m.expenses));
  }
});

test('getInvestments totaliza monto invertido y ganancia', async () => {
  const { tools } = freshTools();
  const { investments, totalInvested, totalGain } = await tools.getInvestments();
  assert.equal(totalInvested, investments.reduce((s, i) => s + i.amount, 0));
  assert.ok(totalGain > 0);
});

test('getExchangeRates incluye USD con compra < venta', async () => {
  const { tools } = freshTools();
  const { rates } = await tools.getExchangeRates();
  const usd = rates.find((r) => r.currency === 'USD');
  assert.ok(usd);
  assert.ok(usd.buy < usd.sell);
});

test('simulateCredit calcula pago mensual con fórmula de amortización', async () => {
  const { tools } = freshTools();
  const sim = await tools.simulateCredit({ productId: 'CRED-AUTO', amount: 350000, months: 48 });
  assert.equal(sim.error, undefined);
  assert.equal(sim.amount, 350000);
  assert.ok(sim.annualRate >= 12.9 && sim.annualRate <= 16.5);
  // Verificación independiente de la fórmula
  const r = sim.annualRate / 100 / 12;
  const expected = (350000 * r) / (1 - Math.pow(1 + r, -48));
  assert.ok(Math.abs(sim.monthlyPayment - expected) < 0.01);
  assert.equal(sim.totalInterest, round2(sim.totalPayment - 350000));
});

test('simulateCredit rechaza producto inexistente y montos fuera de rango', async () => {
  const { tools } = freshTools();
  assert.ok((await tools.simulateCredit({ productId: 'NO-EXISTE', amount: 1000, months: 12 })).error);
  assert.ok((await tools.simulateCredit({ productId: 'CRED-AUTO', amount: 99999999, months: 12 })).error);
  assert.ok((await tools.simulateCredit({ productId: 'CRED-AUTO', amount: 100000, months: 999 })).error);
  assert.ok((await tools.simulateCredit({ productId: 'CRED-AUTO', amount: -5, months: 12 })).error);
});

test('transferFunds a beneficiario descuenta saldo y registra movimiento', async () => {
  const { repo, tools } = freshTools();
  const before = await balanceOf(repo, 'ACC-001');
  const result = await tools.transferFunds({
    fromAccountId: 'ACC-001',
    toBeneficiaryId: 'BEN-01',
    amount: 1500,
    concept: 'Prueba',
    confirmed: true,
  });
  assert.equal(result.success, true);
  assert.ok(result.folio.startsWith('SPEI-'));
  assert.equal(result.newBalance, round2(before - 1500));
  assert.equal(await balanceOf(repo, 'ACC-001'), result.newBalance);
  const [tx] = await repo.listTransactions({ limit: 1 });
  assert.equal(tx.id, result.transactionId);
  assert.equal(tx.amount, -1500);
  assert.equal(tx.category, 'Transferencias');
  assert.match(tx.description, /Prueba/);
});

test('transferFunds entre cuentas propias acredita el destino', async () => {
  const { repo, tools } = freshTools();
  const destBefore = await balanceOf(repo, 'ACC-002');
  const result = await tools.transferFunds({
    fromAccountId: 'ACC-001',
    toAccountId: 'ACC-002',
    amount: 2000,
    confirmed: true,
  });
  assert.equal(result.success, true);
  assert.equal(await balanceOf(repo, 'ACC-002'), round2(destBefore + 2000));
  const received = (await repo.listTransactions({ accountId: 'ACC-002', limit: 1 }))[0];
  assert.equal(received.amount, 2000);
  assert.equal(received.type, 'credit');
});

test('transferFunds rechaza saldo insuficiente, montos inválidos y orígenes malos', async () => {
  const { tools } = freshTools();
  assert.ok((await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 99999999, confirmed: true })).error);
  assert.ok((await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 0, confirmed: true })).error);
  assert.ok((await tools.transferFunds({ fromAccountId: 'ACC-003', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: true })).error);
  assert.ok((await tools.transferFunds({ fromAccountId: 'NO-EXISTE', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: true })).error);
  assert.ok((await tools.transferFunds({ fromAccountId: 'ACC-001', amount: 100, confirmed: true })).error);
});

test('una transferencia no muta los datos semilla ni otros repositorios', async () => {
  const { tools } = freshTools();
  await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 5000, confirmed: true });
  const fresh = createMemoryRepository();
  const seedBalance = bankSeed.accounts.find((a) => a.id === 'ACC-001').balance;
  assert.equal(await balanceOf(fresh, 'ACC-001'), seedBalance);
});

test('transferFunds exige confirmación explícita (compuerta en código, no en el prompt)', async () => {
  const { repo, tools } = freshTools();
  const before = await balanceOf(repo, 'ACC-001');
  const noFlag = await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100 });
  const falseFlag = await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: false });
  const stringFlag = await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: 'true' });
  assert.ok(noFlag.error && falseFlag.error && stringFlag.error);
  assert.equal(await balanceOf(repo, 'ACC-001'), before);
});

test('transferFunds respeta el tope por operación', async () => {
  const richAccounts = bankSeed.accounts.map((a) =>
    a.id === 'ACC-001' ? { ...a, balance: MAX_TRANSFER_AMOUNT * 3, availableBalance: MAX_TRANSFER_AMOUNT * 3 } : a,
  );
  const { tools } = freshTools({ seed: { ...bankSeed, accounts: richAccounts } });
  const over = await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: MAX_TRANSFER_AMOUNT + 1, confirmed: true });
  assert.ok(over.error);
  const atLimit = await tools.transferFunds({ fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: MAX_TRANSFER_AMOUNT, confirmed: true });
  assert.equal(atLimit.success, true);
});

test('transferFunds rechaza transferencias a la misma cuenta sin registrar nada', async () => {
  const { repo, tools } = freshTools();
  const countBefore = (await repo.listTransactions()).length;
  const result = await tools.transferFunds({ fromAccountId: 'ACC-001', toAccountId: 'ACC-001', amount: 100, confirmed: true });
  assert.ok(result.error);
  assert.equal((await repo.listTransactions()).length, countBefore);
});

test('getTransactions usa el límite por defecto ante valores inválidos', async () => {
  const { repo, tools } = freshTools();
  const total = (await repo.listTransactions()).length;
  assert.equal((await tools.getTransactions({ limit: 0 })).length, 15);
  assert.equal((await tools.getTransactions({ limit: null })).length, 15);
  assert.equal((await tools.getTransactions({ limit: 500 })).length, Math.min(50, total));
});

test('getPortfolio totaliza posiciones y la distribución suma 100%', async () => {
  const { tools } = freshTools();
  const p = await tools.getPortfolio();
  assert.equal(p.currency, 'USD');
  assert.equal(p.holdings.length, 4);
  assert.equal(round2(p.holdings.reduce((s, h) => s + h.value, 0)), p.totalValue);
  const pct = p.allocation.reduce((s, a) => s + a.pct, 0);
  assert.ok(Math.abs(pct - 100) < 0.1);
  assert.ok(p.holdings.every((h) => h.value === round2(h.units * h.price)));
});

test('getWatchlist filtra ganadoras/perdedoras y ordena por vistas por defecto', async () => {
  const { tools } = freshTools();
  const gain = (await tools.getWatchlist({ filter: 'gain' })).items;
  assert.ok(gain.length > 0 && gain.every((w) => w.changePct > 0));
  for (let i = 1; i < gain.length; i++) assert.ok(gain[i - 1].changePct >= gain[i].changePct);
  const lose = (await tools.getWatchlist({ filter: 'lose' })).items;
  assert.ok(lose.length > 0 && lose.every((w) => w.changePct < 0));
  const viewed = (await tools.getWatchlist()).items;
  for (let i = 1; i < viewed.length; i++) assert.ok(viewed[i - 1].views >= viewed[i].views);
  assert.ok(viewed.every((w) => Array.isArray(w.sparkline) && w.sparkline.length === 24));
});

test('getPortfolioPerformance termina en el valor total y es determinista', async () => {
  const { tools } = freshTools();
  const total = (await tools.getPortfolio()).totalValue;
  const year = await tools.getPortfolioPerformance({ range: '1Y' });
  assert.equal(year.endValue, total);
  assert.equal(year.points.length, 53);
  assert.ok(year.points[year.highlightIndex].v >= Math.max(...year.points.map((p) => p.v)));
  assert.deepEqual(await tools.getPortfolioPerformance({ range: '1Y' }), year);
  const all = await tools.getPortfolioPerformance({ range: 'ALL' });
  assert.deepEqual(Object.keys(all.ranges), ['1D', '1W', '1M', '6M', '1Y']);
  assert.ok(Object.values(all.ranges).every((s) => s.endValue === total));
  assert.ok((await tools.getPortfolioPerformance({ range: '5Y' })).error);
});

test('transferencias concurrentes no pueden sobregirar la cuenta (verificación atómica en el repositorio)', async () => {
  const { repo, tools } = freshTools();
  const available = (await repo.findAccount('ACC-001')).availableBalance;
  // Cada una cabe sola; juntas exceden el saldo disponible.
  const amount = Math.min(Math.floor(available * 0.6), MAX_TRANSFER_AMOUNT);
  const request = { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount, confirmed: true };

  const results = await Promise.all([tools.transferFunds(request), tools.transferFunds(request)]);

  assert.equal(results.filter((r) => r.success).length, 1);
  assert.match(results.find((r) => r.error).error, /Saldo insuficiente/);
  const after = await repo.findAccount('ACC-001');
  assert.ok(after.availableBalance >= 0);
  assert.equal(after.availableBalance, round2(available - amount));
});

test('cada transferencia recibe un folio distinto aunque ocurran en el mismo milisegundo', async () => {
  const { tools } = freshTools();
  const request = { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 10, confirmed: true };
  const [a, b] = await Promise.all([tools.transferFunds(request), tools.transferFunds(request)]);
  assert.ok(a.success && b.success);
  assert.notEqual(a.folio, b.folio);
  assert.notEqual(a.transactionId, b.transactionId);
});

// ---------- Reestructura de tarjeta ----------

test('getCardRestructureOptions calcula un plan por plazo con ahorro contra la tasa de la tarjeta', async () => {
  const { tools } = freshTools();
  const options = await tools.getCardRestructureOptions();
  assert.equal(options.accountId, 'ACC-003');
  assert.equal(options.balance, 23410.5);
  assert.equal(options.currentRate, 45.9);
  assert.equal(options.annualRate, 26.9);
  assert.deepEqual(options.options.map((o) => o.months), [6, 12, 18, 24, 36]);
  const twelve = options.options.find((o) => o.months === 12);
  // Misma fórmula que la renderer function `amortize` del cliente.
  const rate = 26.9 / 100 / 12;
  assert.equal(twelve.monthlyPayment, round2((23410.5 * rate) / (1 - Math.pow(1 + rate, -12))));
  assert.ok(twelve.savings > 0, 'la tasa preferente ahorra intereses');
  assert.ok(twelve.totalInterest < twelve.interestAtCardRate);
  assert.match((await tools.getCardRestructureOptions({ accountId: 'ACC-001' })).error, /no es una tarjeta/);
  assert.match((await tools.getCardRestructureOptions({ accountId: 'ACC-999' })).error, /no encontrada/);
});

test('restructureCardDebt exige confirmación del servidor y un plazo del catálogo', async () => {
  const { tools } = freshTools();
  assert.match((await tools.restructureCardDebt({ months: 12 })).error, /confirmación/);
  assert.match((await tools.restructureCardDebt({ months: 12, confirmed: 'true' })).error, /confirmación/);
  assert.match((await tools.restructureCardDebt({ months: 13, confirmed: true })).error, /plazo/i);
});

test('restructureCardDebt aplica el plan: la tarjeta queda con la mensualidad y la tasa del plan', async () => {
  const { tools, repo } = freshTools();
  const result = await tools.restructureCardDebt({ accountId: 'ACC-003', months: 12, confirmed: true });
  assert.equal(result.success, true);
  assert.match(result.folio, /^REST-\d{6}-12$/);
  assert.equal(result.annualRate, 26.9);
  assert.equal(result.previousRate, 45.9);
  assert.ok(result.monthlyPayment > 0);
  assert.equal(result.firstPaymentDate, '2026-09-15');

  const card = await repo.findAccount('ACC-003');
  assert.equal(card.minimumPayment, result.monthlyPayment);
  assert.equal(card.interestRate, 26.9);
  assert.equal(card.plan.months, 12);
  assert.equal(card.balance, -23410.5, 'el saldo sigue siendo deuda; solo cambia cómo se paga');
  assert.equal((await tools.getCardRestructureOptions()).existingPlan.folio, result.folio);
});

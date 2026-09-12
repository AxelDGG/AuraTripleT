import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBankState,
  getCustomerProfile,
  getAccounts,
  getTransactions,
  getSpendingByCategory,
  getMonthlyCashflow,
  getInvestments,
  getExchangeRates,
  simulateCredit,
  transferFunds,
  MAX_TRANSFER_AMOUNT,
  getPortfolio,
  getWatchlist,
  getPortfolioPerformance,
} from '../src/tools.js';
import { accounts as seedAccounts } from '../src/data/mockData.js';

test('getCustomerProfile devuelve el perfil del cliente', () => {
  const profile = getCustomerProfile();
  assert.equal(profile.name, 'María Fernanda López García');
  assert.ok(profile.creditScore > 0);
});

test('getAccounts devuelve las 3 cuentas con saldos', () => {
  const state = createBankState();
  const accounts = getAccounts(state);
  assert.equal(accounts.length, 3);
  assert.ok(accounts.every((a) => typeof a.balance === 'number'));
});

test('getTransactions filtra por cuenta y respeta el límite', () => {
  const state = createBankState();
  const txs = getTransactions(state, { accountId: 'ACC-003', limit: 5 });
  assert.ok(txs.length <= 5);
  assert.ok(txs.every((t) => t.accountId === 'ACC-003'));
});

test('getTransactions filtra por categoría sin distinguir mayúsculas', () => {
  const state = createBankState();
  const txs = getTransactions(state, { category: 'restaurantes' });
  assert.ok(txs.length > 0);
  assert.ok(txs.every((t) => t.category === 'Restaurantes'));
});

test('getTransactions ordena del más reciente al más antiguo', () => {
  const state = createBankState();
  const txs = getTransactions(state, { limit: 50 });
  for (let i = 1; i < txs.length; i++) {
    assert.ok(txs[i - 1].date >= txs[i].date);
  }
});

test('getSpendingByCategory suma solo cargos y ordena descendente', () => {
  const state = createBankState();
  const { categories, totalSpent } = getSpendingByCategory(state);
  assert.ok(categories.length > 0);
  assert.ok(totalSpent > 0);
  for (let i = 1; i < categories.length; i++) {
    assert.ok(categories[i - 1].total >= categories[i].total);
  }
  const sum = Math.round(categories.reduce((s, c) => s + c.total, 0) * 100) / 100;
  assert.equal(sum, totalSpent);
});

test('getMonthlyCashflow calcula neto = ingresos - gastos', () => {
  const state = createBankState();
  const months = getMonthlyCashflow(state);
  assert.ok(months.length >= 2);
  for (const m of months) {
    assert.equal(m.net, Math.round((m.income - m.expenses) * 100) / 100);
  }
});

test('getInvestments totaliza monto invertido y ganancia', () => {
  const { investments, totalInvested, totalGain } = getInvestments();
  assert.equal(totalInvested, investments.reduce((s, i) => s + i.amount, 0));
  assert.ok(totalGain > 0);
});

test('getExchangeRates incluye USD con compra < venta', () => {
  const { rates } = getExchangeRates();
  const usd = rates.find((r) => r.currency === 'USD');
  assert.ok(usd);
  assert.ok(usd.buy < usd.sell);
});

test('simulateCredit calcula pago mensual con fórmula de amortización', () => {
  const sim = simulateCredit({ productId: 'CRED-AUTO', amount: 350000, months: 48 });
  assert.equal(sim.error, undefined);
  assert.equal(sim.amount, 350000);
  assert.ok(sim.annualRate >= 12.9 && sim.annualRate <= 16.5);
  // Verificación independiente de la fórmula
  const r = sim.annualRate / 100 / 12;
  const expected = (350000 * r) / (1 - Math.pow(1 + r, -48));
  assert.ok(Math.abs(sim.monthlyPayment - expected) < 0.01);
  assert.equal(sim.totalInterest, Math.round((sim.totalPayment - 350000) * 100) / 100);
});

test('simulateCredit rechaza producto inexistente y montos fuera de rango', () => {
  assert.ok(simulateCredit({ productId: 'NO-EXISTE', amount: 1000, months: 12 }).error);
  assert.ok(simulateCredit({ productId: 'CRED-AUTO', amount: 99999999, months: 12 }).error);
  assert.ok(simulateCredit({ productId: 'CRED-AUTO', amount: 100000, months: 999 }).error);
  assert.ok(simulateCredit({ productId: 'CRED-AUTO', amount: -5, months: 12 }).error);
});

test('transferFunds a beneficiario descuenta saldo y registra movimiento', () => {
  const state = createBankState();
  const before = state.accounts.find((a) => a.id === 'ACC-001').balance;
  const result = transferFunds(state, {
    fromAccountId: 'ACC-001',
    toBeneficiaryId: 'BEN-01',
    amount: 1500,
    concept: 'Prueba',
    confirmed: true,
  });
  assert.equal(result.success, true);
  assert.ok(result.folio.startsWith('SPEI-'));
  assert.equal(result.newBalance, Math.round((before - 1500) * 100) / 100);
  const tx = state.transactions[0];
  assert.equal(tx.amount, -1500);
  assert.equal(tx.category, 'Transferencias');
});

test('transferFunds entre cuentas propias acredita el destino', () => {
  const state = createBankState();
  const destBefore = state.accounts.find((a) => a.id === 'ACC-002').balance;
  const result = transferFunds(state, {
    fromAccountId: 'ACC-001',
    toAccountId: 'ACC-002',
    amount: 2000,
    confirmed: true,
  });
  assert.equal(result.success, true);
  const destAfter = state.accounts.find((a) => a.id === 'ACC-002').balance;
  assert.equal(destAfter, Math.round((destBefore + 2000) * 100) / 100);
});

test('transferFunds rechaza saldo insuficiente, montos inválidos y orígenes malos', () => {
  const state = createBankState();
  assert.ok(transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 99999999, confirmed: true }).error);
  assert.ok(transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 0, confirmed: true }).error);
  assert.ok(transferFunds(state, { fromAccountId: 'ACC-003', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: true }).error);
  assert.ok(transferFunds(state, { fromAccountId: 'NO-EXISTE', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: true }).error);
  assert.ok(transferFunds(state, { fromAccountId: 'ACC-001', amount: 100, confirmed: true }).error);
});

test('el estado del banco no muta los datos semilla', () => {
  const state = createBankState();
  transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 5000, confirmed: true });
  const fresh = createBankState();
  assert.equal(fresh.accounts.find((a) => a.id === 'ACC-001').balance, seedAccounts.find((a) => a.id === 'ACC-001').balance);
});

test('transferFunds exige confirmación explícita (compuerta en código, no en el prompt)', () => {
  const state = createBankState();
  const before = state.accounts.find((a) => a.id === 'ACC-001').balance;
  const noFlag = transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100 });
  const falseFlag = transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: false });
  const stringFlag = transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: 100, confirmed: 'true' });
  assert.ok(noFlag.error && falseFlag.error && stringFlag.error);
  assert.equal(state.accounts.find((a) => a.id === 'ACC-001').balance, before);
});

test('transferFunds respeta el tope por operación', () => {
  const state = createBankState();
  state.accounts.find((a) => a.id === 'ACC-001').availableBalance = MAX_TRANSFER_AMOUNT * 3;
  const over = transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: MAX_TRANSFER_AMOUNT + 1, confirmed: true });
  assert.ok(over.error);
  const atLimit = transferFunds(state, { fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-01', amount: MAX_TRANSFER_AMOUNT, confirmed: true });
  assert.equal(atLimit.success, true);
});

test('transferFunds rechaza transferencias a la misma cuenta', () => {
  const state = createBankState();
  const result = transferFunds(state, { fromAccountId: 'ACC-001', toAccountId: 'ACC-001', amount: 100, confirmed: true });
  assert.ok(result.error);
  assert.equal(state.transactions[0].id, 'TX-1041');
});

test('getTransactions usa el límite por defecto ante valores inválidos', () => {
  const state = createBankState();
  assert.equal(getTransactions(state, { limit: 0 }).length, 15);
  assert.equal(getTransactions(state, { limit: null }).length, 15);
  assert.equal(getTransactions(state, { limit: 500 }).length, Math.min(50, state.transactions.length));
});

test('getPortfolio totaliza posiciones y la distribución suma 100%', () => {
  const p = getPortfolio();
  assert.equal(p.currency, 'USD');
  assert.equal(p.holdings.length, 4);
  const sum = Math.round(p.holdings.reduce((s, h) => s + h.value, 0) * 100) / 100;
  assert.equal(sum, p.totalValue);
  const pct = p.allocation.reduce((s, a) => s + a.pct, 0);
  assert.ok(Math.abs(pct - 100) < 0.1);
  assert.ok(p.holdings.every((h) => h.value === Math.round(h.units * h.price * 100) / 100));
});

test('getWatchlist filtra ganadoras/perdedoras y ordena por vistas por defecto', () => {
  const gain = getWatchlist({ filter: 'gain' }).items;
  assert.ok(gain.length > 0 && gain.every((w) => w.changePct > 0));
  for (let i = 1; i < gain.length; i++) assert.ok(gain[i - 1].changePct >= gain[i].changePct);
  const lose = getWatchlist({ filter: 'lose' }).items;
  assert.ok(lose.length > 0 && lose.every((w) => w.changePct < 0));
  const viewed = getWatchlist().items;
  for (let i = 1; i < viewed.length; i++) assert.ok(viewed[i - 1].views >= viewed[i].views);
  assert.ok(viewed.every((w) => Array.isArray(w.sparkline) && w.sparkline.length === 24));
});

test('getPortfolioPerformance termina en el valor total y es determinista', () => {
  const total = getPortfolio().totalValue;
  const year = getPortfolioPerformance({ range: '1Y' });
  assert.equal(year.endValue, total);
  assert.equal(year.points.length, 53);
  assert.ok(year.points[year.highlightIndex].v >= Math.max(...year.points.map((p) => p.v)));
  assert.deepEqual(getPortfolioPerformance({ range: '1Y' }), year);
  const all = getPortfolioPerformance({ range: 'ALL' });
  assert.deepEqual(Object.keys(all.ranges), ['1D', '1W', '1M', '6M', '1Y']);
  assert.ok(Object.values(all.ranges).every((s) => s.endValue === total));
  assert.ok(getPortfolioPerformance({ range: '5Y' }).error);
});

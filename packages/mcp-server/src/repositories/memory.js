// Repositorio en memoria: implementa el contrato de datos bancarios sobre los
// seeds sintéticos. Es la fuente por defecto; el repositorio `tiger`
// (TimescaleDB) implementará el mismo contrato con SQL.
//
// Contrato (todos los métodos son async y devuelven copias, nunca referencias):
//   getCustomer() · listAccounts() · findAccount(id)
//   listTransactions({ accountId?, category?, limit? })  → ordenadas de más reciente a más antigua
//   listInvestments() · listExchangeRates() · listBeneficiaries() · findBeneficiary(id)
//   listCreditProducts() · findCreditProduct(id) · listHoldings() · listWatchlist()
//   applyTransfer({...})  → persiste una transferencia ya validada por las tools
//   Agregados (en Tiger salen de los continuous aggregates; aquí se calculan sobre la lista):
//   spendingByCategory({ accountId?, months? }) · monthlyCashflow({ accountId? })
//   spendingTrend({ accountId?, category?, months? })
//   recurringPayments({ accountId?, months?, minMonths?, maxPerMonth?, maxDayStddev? })

import * as bankSeed from '../data/mockData.js';
import * as marketSeed from '../data/marketData.js';
import { medianDisc, monthWindow, movingAverage, sampleStats } from './time-series.js';

const FIRST_GENERATED_TX_ID = 1042;
const TRANSFER_CATEGORY = 'Transferencias';

const clone = (value) => structuredClone(value);
const round2 = (n) => Math.round(n * 100) / 100;
const monthOf = (date) => date.slice(0, 7);

export function createMemoryRepository({ seed = bankSeed, market = marketSeed, now = () => new Date() } = {}) {
  // Estado propio de esta instancia (clonado del seed): el seed nunca se modifica.
  let state = {
    accounts: clone(seed.accounts),
    transactions: clone(seed.transactions),
    nextTxId: FIRST_GENERATED_TX_ID,
  };

  const nextTransactionId = () => {
    const id = `TX-${state.nextTxId}`;
    state = { ...state, nextTxId: state.nextTxId + 1 };
    return id;
  };

  return {
    kind: 'memory',

    async getCustomer() {
      return clone(seed.customer);
    },

    async listAccounts() {
      return clone(state.accounts);
    },

    async findAccount(id) {
      const account = state.accounts.find((a) => a.id === id);
      return account ? clone(account) : null;
    },

    async listTransactions({ accountId, category, limit } = {}) {
      let txs = state.transactions;
      if (accountId) txs = txs.filter((t) => t.accountId === accountId);
      if (category) {
        const wanted = category.toLowerCase();
        txs = txs.filter((t) => t.category.toLowerCase() === wanted);
      }
      const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
      return clone(limit ? sorted.slice(0, limit) : sorted);
    },

    // Los tres agregados replican, en JavaScript, lo que en Tiger resuelven los
    // continuous aggregates `spending_by_category_monthly` y `monthly_cashflow`:
    // solo cargos (amount < 0), buckets por mes calendario.
    async spendingByCategory({ accountId, months } = {}) {
      const window = months ? monthWindow(now(), months) : null;
      const totals = new Map();
      for (const t of state.transactions) {
        if (t.amount >= 0) continue;
        if (accountId && t.accountId !== accountId) continue;
        if (window && (monthOf(t.date) < window.first || monthOf(t.date) > window.current)) continue;
        const entry = totals.get(t.category) ?? { category: t.category, total: 0, movements: 0 };
        entry.total += -t.amount;
        entry.movements += 1;
        totals.set(t.category, entry);
      }
      return [...totals.values()]
        .map((c) => ({ ...c, total: round2(c.total) }))
        .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
    },

    async monthlyCashflow({ accountId } = {}) {
      const byMonth = new Map();
      for (const t of state.transactions) {
        if (accountId && t.accountId !== accountId) continue;
        const month = monthOf(t.date);
        const entry = byMonth.get(month) ?? { month, income: 0, expenses: 0, movements: 0 };
        entry.income += t.amount > 0 ? t.amount : 0;
        entry.expenses += t.amount < 0 ? -t.amount : 0;
        entry.movements += 1;
        byMonth.set(month, entry);
      }
      return [...byMonth.values()]
        .map((e) => ({ ...e, income: round2(e.income), expenses: round2(e.expenses) }))
        .sort((a, b) => a.month.localeCompare(b.month));
    },

    // Serie mensual de gasto con promedio móvil (3 meses), línea base de los
    // meses completos anteriores al último cerrado y detalle por categoría.
    // El mismo contrato que `tiger.spendingTrend`, que lo resuelve con
    // time_bucket_gapfill y stats_agg de TimescaleDB Toolkit.
    async spendingTrend({ accountId, category, months = 6 } = {}) {
      const window = monthWindow(now(), months);
      const wanted = category ? category.toLowerCase() : null;
      const perMonth = new Map(window.months.map((m) => [m, { month: m, spent: 0, movements: 0 }]));
      const perCategory = new Map();
      for (const t of state.transactions) {
        if (t.amount >= 0) continue;
        if (accountId && t.accountId !== accountId) continue;
        if (wanted && t.category.toLowerCase() !== wanted) continue;
        const month = monthOf(t.date);
        const bucket = perMonth.get(month);
        if (!bucket) continue;
        bucket.spent += -t.amount;
        bucket.movements += 1;
        const cat = perCategory.get(t.category) ?? { category: t.category, lastMonth: 0, baselineTotal: 0 };
        if (month === window.lastComplete) cat.lastMonth += -t.amount;
        else if (month < window.lastComplete) cat.baselineTotal += -t.amount;
        perCategory.set(t.category, cat);
      }
      const spent = window.months.map((m) => perMonth.get(m).spent);
      const moving = movingAverage(spent, 3);
      const series = window.months.map((m, i) => ({
        month: m,
        spent: round2(perMonth.get(m).spent),
        movements: perMonth.get(m).movements,
        movingAvg: round2(moving[i]),
      }));
      const baselineValues = series.filter((s) => s.month < window.lastComplete).map((s) => s.spent);
      const stats = sampleStats(baselineValues);
      const baselineMonths = Math.max(baselineValues.length, 1);
      const categories = [...perCategory.values()]
        .map((c) => ({ category: c.category, lastMonth: round2(c.lastMonth), baselineAvg: round2(c.baselineTotal / baselineMonths) }))
        .sort((a, b) => b.lastMonth - a.lastMonth || a.category.localeCompare(b.category));
      return {
        series,
        baseline: { months: baselineValues.length, average: round2(stats.average), stddev: round2(stats.stddev) },
        categories,
      };
    },

    // Cargos que se repiten mes con mes (la renta, el recibo de luz, una
    // suscripción). No hay tabla de domiciliaciones en el banco simulado: el
    // patrón se infiere de los movimientos, agrupando por cuenta + categoría +
    // concepto. Los umbrales los fija quien llama (las tools); aquí solo se
    // aplican, igual que en `tiger.recurringPayments`, que hace lo mismo en SQL.
    async recurringPayments({ accountId, months = 6, minMonths = 3, maxPerMonth = 1.5, maxDayStddev = 3 } = {}) {
      const window = monthWindow(now(), months);
      const groups = new Map();
      for (const t of state.transactions) {
        if (t.amount >= 0) continue;
        if (accountId && t.accountId !== accountId) continue;
        const month = monthOf(t.date);
        if (month < window.first || month > window.current) continue;
        const key = `${t.accountId}|${t.category}|${t.description}`;
        const group = groups.get(key) ?? {
          accountId: t.accountId,
          description: t.description,
          category: t.category,
          days: [],
          months: new Set(),
          total: 0,
          lastDate: '',
          lastAmount: 0,
        };
        const amount = -t.amount;
        group.days.push(Number(t.date.slice(8, 10)));
        group.months.add(month);
        group.total += amount;
        // El desempate por monto mantiene el resultado estable si dos cargos
        // del mismo concepto cayeran el mismo día (en SQL es el mismo ORDER BY).
        if (t.date > group.lastDate || (t.date === group.lastDate && amount > group.lastAmount)) {
          group.lastDate = t.date;
          group.lastAmount = amount;
        }
        groups.set(key, group);
      }
      return [...groups.values()]
        .map((g) => ({
          accountId: g.accountId,
          description: g.description,
          category: g.category,
          occurrences: g.days.length,
          monthsSeen: g.months.size,
          dayOfMonth: medianDisc(g.days),
          dayStddev: round2(sampleStats(g.days).stddev),
          averageAmount: round2(g.total / g.days.length),
          lastAmount: round2(g.lastAmount),
          lastDate: g.lastDate,
        }))
        // Mensual de verdad: aparece en varios meses, no más de ~1 vez por mes
        // (eso deja fuera el súper, que son varias compras al mes) y siempre
        // cerca del mismo día (eso deja fuera el gasto ocasional).
        .filter((g) => g.monthsSeen >= minMonths && g.occurrences <= g.monthsSeen * maxPerMonth && g.dayStddev <= maxDayStddev)
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description) || a.accountId.localeCompare(b.accountId));
    },

    async listInvestments() {
      return clone(seed.investments);
    },

    async listExchangeRates() {
      return clone(seed.exchangeRates);
    },

    async listBeneficiaries() {
      return clone(seed.beneficiaries);
    },

    async findBeneficiary(id) {
      const beneficiary = seed.beneficiaries.find((b) => b.id === id);
      return beneficiary ? clone(beneficiary) : null;
    },

    async listCreditProducts() {
      return clone(seed.creditProducts);
    },

    async findCreditProduct(id) {
      const product = seed.creditProducts.find((p) => p.id === id);
      return product ? clone(product) : null;
    },

    async listHoldings() {
      return clone(market.holdings);
    },

    async listWatchlist() {
      return clone(market.watchlist);
    },

    // Aplica una transferencia: verifica el saldo disponible y muta el estado en
    // el MISMO tick (sin awaits en medio), así dos transferencias concurrentes no
    // pueden leer el mismo saldo y cobrarlo dos veces. Descuenta la cuenta
    // origen, abona la destino si es propia (y no es de crédito) y registra los
    // movimientos. Devuelve { ok, reason } o { ok, ids, newBalance }.
    // El equivalente en SQL es un UPDATE condicionado por saldo dentro de una transacción.
    async applyTransfer({ fromAccountId, toAccountId, amount, date, debitDescription, creditDescription }) {
      const source = state.accounts.find((a) => a.id === fromAccountId);
      if (!source) return { ok: false, reason: 'account_not_found' };
      if (source.availableBalance < amount) {
        return { ok: false, reason: 'insufficient_funds', availableBalance: source.availableBalance };
      }
      const destination = toAccountId ? state.accounts.find((a) => a.id === toAccountId) : null;
      const creditsDestination = Boolean(destination && destination.type !== 'credit');

      const accounts = state.accounts.map((account) => {
        if (account.id === fromAccountId) {
          return {
            ...account,
            balance: round2(account.balance - amount),
            availableBalance: round2(account.availableBalance - amount),
          };
        }
        if (creditsDestination && account.id === toAccountId) {
          return {
            ...account,
            balance: round2(account.balance + amount),
            availableBalance: round2(account.availableBalance + amount),
          };
        }
        return account;
      });

      const debitTransactionId = nextTransactionId();
      const debitTx = {
        id: debitTransactionId,
        accountId: fromAccountId,
        date,
        description: debitDescription,
        category: TRANSFER_CATEGORY,
        amount: -amount,
        type: 'debit',
      };
      const creditTransactionId = creditsDestination ? nextTransactionId() : null;
      const creditTx = creditsDestination
        ? {
            id: creditTransactionId,
            accountId: toAccountId,
            date,
            description: creditDescription,
            category: TRANSFER_CATEGORY,
            amount,
            type: 'credit',
          }
        : null;

      state = {
        ...state,
        accounts,
        transactions: [...(creditTx ? [creditTx] : []), debitTx, ...state.transactions],
      };

      const from = accounts.find((a) => a.id === fromAccountId);
      return { ok: true, debitTransactionId, creditTransactionId, newBalance: from.balance };
    },

    // Reestructura (simulada): la tarjeta queda con el plan y su mensualidad
    // pasa a ser el pago del plan. El saldo no se mueve: sigue siendo deuda,
    // solo cambia cómo se paga.
    async applyRestructure({ accountId, plan }) {
      const account = state.accounts.find((a) => a.id === accountId);
      if (!account) return { ok: false, reason: 'account_not_found' };
      const firstPaymentDate = account.paymentDue ?? plan.startedAt;
      state = {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === accountId ? { ...a, plan: { ...plan, firstPaymentDate }, minimumPayment: plan.monthlyPayment, interestRate: plan.annualRate } : a,
        ),
      };
      return { ok: true, firstPaymentDate };
    },
  };
}

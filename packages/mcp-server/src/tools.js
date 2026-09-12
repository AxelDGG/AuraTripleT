// Implementación de las herramientas bancarias expuestas vía MCP.
// Funciones puras sobre los datos mock; las operaciones de escritura
// (transferencias) trabajan sobre un estado en memoria clonado al inicio.

import {
  customer,
  accounts as seedAccounts,
  transactions as seedTransactions,
  investments,
  exchangeRates,
  creditProducts,
  beneficiaries,
} from './data/mockData.js';
import {
  holdings,
  watchlist,
  PORTFOLIO_CURRENCY,
  PERFORMANCE_RANGES,
  buildPerformanceSeries,
  buildSparkline,
} from './data/marketData.js';

export function createBankState() {
  return {
    accounts: structuredClone(seedAccounts),
    transactions: structuredClone(seedTransactions),
    nextTxId: 1042,
  };
}

export function getCustomerProfile() {
  return { ...customer };
}

export function getAccounts(state) {
  return state.accounts.map((a) => ({ ...a }));
}

export function getTransactions(state, { accountId, category, limit } = {}) {
  let txs = state.transactions;
  if (accountId) txs = txs.filter((t) => t.accountId === accountId);
  if (category) txs = txs.filter((t) => t.category.toLowerCase() === category.toLowerCase());
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 15;
  return sorted.slice(0, Math.min(effectiveLimit, 50));
}

export function getSpendingByCategory(state, { accountId } = {}) {
  let txs = state.transactions.filter((t) => t.type === 'debit');
  if (accountId) txs = txs.filter((t) => t.accountId === accountId);
  const totals = new Map();
  for (const t of txs) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  const categories = [...totals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
  const totalSpent = Math.round(categories.reduce((s, c) => s + c.total, 0) * 100) / 100;
  return { categories, totalSpent };
}

export function getMonthlyCashflow(state) {
  const byMonth = new Map();
  for (const t of state.transactions) {
    const month = t.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { month, income: 0, expenses: 0 };
    if (t.amount > 0) entry.income += t.amount;
    else entry.expenses += Math.abs(t.amount);
    byMonth.set(month, entry);
  }
  return [...byMonth.values()]
    .map((e) => ({
      month: e.month,
      income: Math.round(e.income * 100) / 100,
      expenses: Math.round(e.expenses * 100) / 100,
      net: Math.round((e.income - e.expenses) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function getInvestments() {
  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const totalGain = Math.round(investments.reduce((s, i) => s + i.gain, 0) * 100) / 100;
  return { investments: structuredClone(investments), totalInvested, totalGain };
}

export function getExchangeRates() {
  return structuredClone(exchangeRates);
}

export function getBeneficiaries() {
  return structuredClone(beneficiaries);
}

export function simulateCredit({ productId, amount, months }) {
  const product = creditProducts.find((p) => p.id === productId);
  if (!product) {
    return { error: `Producto no encontrado. Opciones: ${creditProducts.map((p) => p.id).join(', ')}` };
  }
  if (amount <= 0 || amount > product.maxAmount) {
    return { error: `El monto debe estar entre $1 y $${product.maxAmount.toLocaleString('es-MX')} para ${product.name}.` };
  }
  if (months <= 0 || months > product.maxMonths) {
    return { error: `El plazo debe estar entre 1 y ${product.maxMonths} meses para ${product.name}.` };
  }
  // Tasa dentro del rango del producto según plazo (plazos largos pagan más).
  const rateSpread = product.maxRate - product.minRate;
  const annualRate = Math.round((product.minRate + rateSpread * (months / product.maxMonths)) * 100) / 100;
  const monthlyRate = annualRate / 100 / 12;
  const monthlyPayment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  const totalPayment = monthlyPayment * months;
  return {
    product: product.name,
    productId: product.id,
    amount,
    months,
    annualRate,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
    totalInterest: Math.round((totalPayment - amount) * 100) / 100,
  };
}

export function listCreditProducts() {
  return structuredClone(creditProducts);
}

// Tope por operación: límite independiente del criterio del LLM.
export const MAX_TRANSFER_AMOUNT = 50000;

export function transferFunds(state, { fromAccountId, toBeneficiaryId, toAccountId, amount, concept, confirmed }) {
  // La confirmación la establece el servidor (no el modelo) cuando el usuario
  // envía explícitamente el formulario de transferencia.
  if (confirmed !== true) {
    return { error: 'La transferencia requiere confirmación explícita del usuario. Genera un formulario de transferencia para que la confirme.' };
  }
  if (!amount || amount <= 0) return { error: 'El monto debe ser mayor a cero.' };
  if (amount > MAX_TRANSFER_AMOUNT) {
    return { error: `El monto excede el límite por operación de $${MAX_TRANSFER_AMOUNT.toLocaleString('es-MX')} MXN.` };
  }
  if (toAccountId && toAccountId === fromAccountId) {
    return { error: 'La cuenta origen y la cuenta destino no pueden ser la misma.' };
  }
  const from = state.accounts.find((a) => a.id === fromAccountId);
  if (!from) return { error: `Cuenta origen no encontrada: ${fromAccountId}` };
  if (from.type === 'credit') return { error: 'No se puede transferir desde una tarjeta de crédito.' };
  if (from.availableBalance < amount) {
    return { error: `Saldo insuficiente. Disponible: $${from.availableBalance.toLocaleString('es-MX')}` };
  }

  let destinationLabel;
  const internalDest = toAccountId ? state.accounts.find((a) => a.id === toAccountId) : null;
  const beneficiary = toBeneficiaryId ? beneficiaries.find((b) => b.id === toBeneficiaryId) : null;
  if (internalDest) {
    destinationLabel = internalDest.name;
  } else if (beneficiary) {
    destinationLabel = `${beneficiary.name} (${beneficiary.bank})`;
  } else {
    return { error: 'Destino no válido. Indica toAccountId (cuenta propia) o toBeneficiaryId (tercero).' };
  }

  const date = new Date().toISOString().slice(0, 10);
  from.balance = Math.round((from.balance - amount) * 100) / 100;
  from.availableBalance = Math.round((from.availableBalance - amount) * 100) / 100;
  const txId = `TX-${state.nextTxId++}`;
  state.transactions.unshift({
    id: txId,
    accountId: from.id,
    date,
    description: `Transferencia SPEI a ${destinationLabel}${concept ? ` - ${concept}` : ''}`,
    category: 'Transferencias',
    amount: -amount,
    type: 'debit',
  });

  if (internalDest && internalDest.type !== 'credit') {
    internalDest.balance = Math.round((internalDest.balance + amount) * 100) / 100;
    internalDest.availableBalance = Math.round((internalDest.availableBalance + amount) * 100) / 100;
    state.transactions.unshift({
      id: `TX-${state.nextTxId++}`,
      accountId: internalDest.id,
      date,
      description: `Transferencia recibida de ${from.name}`,
      category: 'Transferencias',
      amount,
      type: 'credit',
    });
  }

  return {
    success: true,
    folio: `SPEI-${Date.now().toString().slice(-8)}`,
    transactionId: txId,
    from: from.name,
    to: destinationLabel,
    amount,
    concept: concept ?? null,
    date,
    newBalance: from.balance,
  };
}

// ---------- Inversión bursátil (dashboard) ----------

const round2 = (n) => Math.round(n * 100) / 100;

export function getPortfolio() {
  const items = holdings.map((h) => {
    const value = round2(h.units * h.price);
    const previousPrice = h.price / (1 + h.changePct / 100);
    const changeAbs = round2(h.units * (h.price - previousPrice));
    return { ...h, value, changeAbs };
  });
  const totalValue = round2(items.reduce((s, i) => s + i.value, 0));
  const totalChangeAbs = round2(items.reduce((s, i) => s + i.changeAbs, 0));
  const totalChangePct = round2((totalChangeAbs / (totalValue - totalChangeAbs)) * 100);
  return {
    currency: PORTFOLIO_CURRENCY,
    holdings: items,
    totalValue,
    totalChangeAbs,
    totalChangePct,
    allocation: items.map((i) => ({ symbol: i.symbol, pct: round2((i.value / totalValue) * 100) })),
  };
}

export function getWatchlist({ filter } = {}) {
  const key = (filter ?? 'most_viewed').toLowerCase();
  const withSparklines = watchlist.map((w) => ({ ...w, sparkline: buildSparkline(w.symbol, w.price, w.changePct) }));
  let items;
  if (key === 'gain') {
    items = withSparklines.filter((w) => w.changePct > 0).sort((a, b) => b.changePct - a.changePct);
  } else if (key === 'lose') {
    items = withSparklines.filter((w) => w.changePct < 0).sort((a, b) => a.changePct - b.changePct);
  } else {
    items = [...withSparklines].sort((a, b) => b.views - a.views);
  }
  return { filter: key, items };
}

export function getPortfolioPerformance({ range } = {}) {
  const total = getPortfolio().totalValue;
  const key = (range ?? '1Y').toUpperCase();
  if (key === 'ALL') {
    const ranges = Object.fromEntries(PERFORMANCE_RANGES.map((r) => [r, buildPerformanceSeries(r, total)]));
    return { currency: PORTFOLIO_CURRENCY, ranges };
  }
  const series = buildPerformanceSeries(key, total);
  if (!series) return { error: `Rango no válido. Opciones: ${PERFORMANCE_RANGES.join(', ')} o ALL.` };
  return { currency: PORTFOLIO_CURRENCY, ...series };
}

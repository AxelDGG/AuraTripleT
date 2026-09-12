// Herramientas bancarias expuestas vía MCP: reglas de negocio sobre un
// repositorio de datos (memoria hoy, Tiger Data después). Las tools no saben
// dónde viven los datos; el repositorio no sabe de reglas de negocio.

import {
  PORTFOLIO_CURRENCY,
  PERFORMANCE_RANGES,
  buildPerformanceSeries,
  buildSparkline,
} from './data/marketData.js';

const DEFAULT_TRANSACTION_LIMIT = 15;
const MAX_TRANSACTION_LIMIT = 50;
// Tope por operación: límite independiente del criterio del LLM.
export const MAX_TRANSFER_AMOUNT = 50000;

const round2 = (n) => Math.round(n * 100) / 100;
const formatMxn = (n) => n.toLocaleString('es-MX');

function effectiveLimit(limit) {
  const wanted = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_TRANSACTION_LIMIT;
  return Math.min(wanted, MAX_TRANSACTION_LIMIT);
}

// Tasa dentro del rango del producto según plazo (plazos largos pagan más).
function annualRateFor(product, months) {
  const spread = product.maxRate - product.minRate;
  return round2(product.minRate + spread * (months / product.maxMonths));
}

export function createBankingTools(repo) {
  async function getCustomerProfile() {
    return repo.getCustomer();
  }

  async function getAccounts() {
    return repo.listAccounts();
  }

  async function getTransactions({ accountId, category, limit } = {}) {
    return repo.listTransactions({ accountId, category, limit: effectiveLimit(limit) });
  }

  async function getSpendingByCategory({ accountId } = {}) {
    const debits = (await repo.listTransactions({ accountId })).filter((t) => t.type === 'debit');
    const totals = new Map();
    for (const t of debits) {
      totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
    }
    const categories = [...totals.entries()]
      .map(([category, total]) => ({ category, total: round2(total) }))
      .sort((a, b) => b.total - a.total);
    const totalSpent = round2(categories.reduce((s, c) => s + c.total, 0));
    return { categories, totalSpent };
  }

  async function getMonthlyCashflow() {
    const byMonth = new Map();
    for (const t of await repo.listTransactions()) {
      const month = t.date.slice(0, 7);
      const entry = byMonth.get(month) ?? { month, income: 0, expenses: 0 };
      const income = entry.income + (t.amount > 0 ? t.amount : 0);
      const expenses = entry.expenses + (t.amount < 0 ? Math.abs(t.amount) : 0);
      byMonth.set(month, { month, income, expenses });
    }
    return [...byMonth.values()]
      .map((e) => ({
        month: e.month,
        income: round2(e.income),
        expenses: round2(e.expenses),
        net: round2(e.income - e.expenses),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async function getInvestments() {
    const investments = await repo.listInvestments();
    const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
    const totalGain = round2(investments.reduce((s, i) => s + i.gain, 0));
    return { investments, totalInvested, totalGain };
  }

  async function getExchangeRates() {
    return repo.listExchangeRates();
  }

  async function getBeneficiaries() {
    return repo.listBeneficiaries();
  }

  async function listCreditProducts() {
    return repo.listCreditProducts();
  }

  async function simulateCredit({ productId, amount, months }) {
    const product = await repo.findCreditProduct(productId);
    if (!product) {
      const options = (await repo.listCreditProducts()).map((p) => p.id).join(', ');
      return { error: `Producto no encontrado. Opciones: ${options}` };
    }
    if (amount <= 0 || amount > product.maxAmount) {
      return { error: `El monto debe estar entre $1 y $${formatMxn(product.maxAmount)} para ${product.name}.` };
    }
    if (months <= 0 || months > product.maxMonths) {
      return { error: `El plazo debe estar entre 1 y ${product.maxMonths} meses para ${product.name}.` };
    }
    const annualRate = annualRateFor(product, months);
    const monthlyRate = annualRate / 100 / 12;
    const monthlyPayment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
    const totalPayment = monthlyPayment * months;
    return {
      product: product.name,
      productId: product.id,
      amount,
      months,
      annualRate,
      monthlyPayment: round2(monthlyPayment),
      totalPayment: round2(totalPayment),
      totalInterest: round2(totalPayment - amount),
    };
  }

  // Valida la transferencia (reglas de negocio) y delega la persistencia al repositorio.
  async function transferFunds({ fromAccountId, toBeneficiaryId, toAccountId, amount, concept, confirmed }) {
    // La confirmación la establece el servidor (no el modelo) cuando el usuario
    // envía explícitamente el formulario de transferencia.
    if (confirmed !== true) {
      return { error: 'La transferencia requiere confirmación explícita del usuario. Genera un formulario de transferencia para que la confirme.' };
    }
    if (!amount || amount <= 0) return { error: 'El monto debe ser mayor a cero.' };
    if (amount > MAX_TRANSFER_AMOUNT) {
      return { error: `El monto excede el límite por operación de $${formatMxn(MAX_TRANSFER_AMOUNT)} MXN.` };
    }
    if (toAccountId && toAccountId === fromAccountId) {
      return { error: 'La cuenta origen y la cuenta destino no pueden ser la misma.' };
    }
    const from = await repo.findAccount(fromAccountId);
    if (!from) return { error: `Cuenta origen no encontrada: ${fromAccountId}` };
    if (from.type === 'credit') return { error: 'No se puede transferir desde una tarjeta de crédito.' };

    const internalDest = toAccountId ? await repo.findAccount(toAccountId) : null;
    const beneficiary = toBeneficiaryId ? await repo.findBeneficiary(toBeneficiaryId) : null;
    let destinationLabel;
    if (internalDest) {
      destinationLabel = internalDest.name;
    } else if (beneficiary) {
      destinationLabel = `${beneficiary.name} (${beneficiary.bank})`;
    } else {
      return { error: 'Destino no válido. Indica toAccountId (cuenta propia) o toBeneficiaryId (tercero).' };
    }

    const date = new Date().toISOString().slice(0, 10);
    // El saldo disponible se verifica dentro de applyTransfer, en el mismo tick
    // que la mutación: dos transferencias concurrentes no pueden cobrar el mismo saldo.
    const applied = await repo.applyTransfer({
      fromAccountId: from.id,
      toAccountId: internalDest?.id ?? null,
      amount,
      date,
      debitDescription: `Transferencia SPEI a ${destinationLabel}${concept ? ` - ${concept}` : ''}`,
      creditDescription: `Transferencia recibida de ${from.name}`,
    });
    if (!applied.ok) {
      return applied.reason === 'insufficient_funds'
        ? { error: `Saldo insuficiente. Disponible: $${formatMxn(applied.availableBalance)}` }
        : { error: `Cuenta origen no encontrada: ${fromAccountId}` };
    }

    return {
      success: true,
      // Folio único por operación: marca de tiempo + número del movimiento generado.
      folio: `SPEI-${Date.now().toString().slice(-6)}-${applied.debitTransactionId.replace('TX-', '')}`,
      transactionId: applied.debitTransactionId,
      from: from.name,
      to: destinationLabel,
      amount,
      concept: concept ?? null,
      date,
      newBalance: applied.newBalance,
    };
  }

  // ---------- Inversión bursátil (dashboard) ----------

  async function getPortfolio() {
    const items = (await repo.listHoldings()).map((h) => {
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

  async function getWatchlist({ filter } = {}) {
    const key = (filter ?? 'most_viewed').toLowerCase();
    const withSparklines = (await repo.listWatchlist()).map((w) => ({
      ...w,
      sparkline: buildSparkline(w.symbol, w.price, w.changePct),
    }));
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

  async function getPortfolioPerformance({ range } = {}) {
    const total = (await getPortfolio()).totalValue;
    const key = (range ?? '1Y').toUpperCase();
    if (key === 'ALL') {
      const ranges = Object.fromEntries(PERFORMANCE_RANGES.map((r) => [r, buildPerformanceSeries(r, total)]));
      return { currency: PORTFOLIO_CURRENCY, ranges };
    }
    const series = buildPerformanceSeries(key, total);
    if (!series) return { error: `Rango no válido. Opciones: ${PERFORMANCE_RANGES.join(', ')} o ALL.` };
    return { currency: PORTFOLIO_CURRENCY, ...series };
  }

  return {
    getCustomerProfile,
    getAccounts,
    getTransactions,
    getSpendingByCategory,
    getMonthlyCashflow,
    getInvestments,
    getExchangeRates,
    getBeneficiaries,
    listCreditProducts,
    simulateCredit,
    transferFunds,
    getPortfolio,
    getWatchlist,
    getPortfolioPerformance,
  };
}

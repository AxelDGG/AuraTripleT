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
const round1 = (n) => Math.round(n * 10) / 10;
const formatMxn = (n) => n.toLocaleString('es-MX');

function effectiveLimit(limit) {
  const wanted = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_TRANSACTION_LIMIT;
  return Math.min(wanted, MAX_TRANSACTION_LIMIT);
}

// Tendencia de gasto: ventana de meses calendario que termina en el mes en curso.
const DEFAULT_TREND_MONTHS = 6;
const MIN_TREND_MONTHS = 3;
const MAX_TREND_MONTHS = 12;
// Hasta ±10% contra la línea base se lee como "estable".
const TREND_STABLE_PCT = 10;
const UNUSUAL_Z = 2;
const TOP_CHANGES = 5;

function trendMonths(months, fallback) {
  if (!Number.isFinite(months) || months <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(months), MIN_TREND_MONTHS), MAX_TREND_MONTHS);
}

// Pagos recurrentes: el banco simulado no tiene tabla de domiciliaciones, así
// que "mis pagos fijos" se infiere de los movimientos. Un cargo es recurrente si
// aparece en al menos 3 meses distintos de la ventana, no más de ~1 vez por mes
// (el súper son varias compras al mes, no un pago fijo) y siempre cerca del
// mismo día: hasta 3 días de desviación, que absorbe los fines de semana.
const RECURRING_MIN_MONTHS = 3;
const RECURRING_MAX_PER_MONTH = 1.5;
const RECURRING_MAX_DAY_STDDEV = 3;
// "Lo que se te viene esta semana".
const RECURRING_DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Reestructura de tarjeta: el saldo se convierte en un plan de pagos fijos a
// tasa preferente. Plazos y tasa son reglas de negocio del banco simulado.
export const RESTRUCTURE_TERMS = [6, 12, 18, 24, 36];
export const RESTRUCTURE_ANNUAL_RATE = 26.9;
// Tasa de la tarjeta si la cuenta no la trae (las tarjetas del seed sí).
const DEFAULT_CARD_RATE = 45.9;

// Pago mensual fijo (fórmula francesa) y totales; misma fórmula que la
// renderer function `amortize` del cliente, así lo que ve la persona al mover
// el slider coincide centavo a centavo con lo que aplica el servidor.
function planFor(amount, months, annualRate) {
  const rate = annualRate / 100 / 12;
  const monthlyPayment = rate > 0 ? (amount * rate) / (1 - Math.pow(1 + rate, -months)) : amount / months;
  const totalPayment = monthlyPayment * months;
  return {
    months,
    annualRate,
    monthlyPayment: round2(monthlyPayment),
    totalPayment: round2(totalPayment),
    totalInterest: round2(totalPayment - amount),
    effectiveAnnual: round2((Math.pow(1 + rate, 12) - 1) * 100),
  };
}

// Tasa dentro del rango del producto según plazo (plazos largos pagan más).
function annualRateFor(product, months) {
  const spread = product.maxRate - product.minRate;
  return round2(product.minRate + spread * (months / product.maxMonths));
}

// El reloj se inyecta para que las fechas calculadas (la próxima ocurrencia de
// un pago recurrente) se puedan probar sin depender del día en que corren.
export function createBankingTools(repo, { now = () => new Date() } = {}) {
  async function getCustomerProfile() {
    return repo.getCustomer();
  }

  async function getAccounts() {
    return repo.listAccounts();
  }

  async function getTransactions({ accountId, category, limit } = {}) {
    return repo.listTransactions({ accountId, category, limit: effectiveLimit(limit) });
  }

  // Los agregados los resuelve el repositorio (en Tiger, continuous aggregates
  // que TimescaleDB mantiene al día; en memoria, un recorrido de la lista).
  async function getSpendingByCategory({ accountId, months } = {}) {
    const span = trendMonths(months, null);
    const categories = (await repo.spendingByCategory({ accountId, months: span })).map(({ category, total }) => ({ category, total }));
    const totalSpent = round2(categories.reduce((s, c) => s + c.total, 0));
    return { categories, totalSpent, ...(span ? { months: span } : {}) };
  }

  async function getMonthlyCashflow() {
    return (await repo.monthlyCashflow()).map((e) => ({
      month: e.month,
      income: e.income,
      expenses: e.expenses,
      net: round2(e.income - e.expenses),
    }));
  }

  // Tendencia de gasto: ¿este mes gasto más o menos que de costumbre, y en qué?
  // El repositorio entrega la serie mensual, la línea base (promedio y
  // desviación estándar de los meses cerrados anteriores al último) y el
  // detalle por categoría; aquí se convierte en la lectura que el agente
  // explica: variación porcentual, z-score y las categorías que más cambiaron.
  async function getSpendingTrend({ accountId, category, months } = {}) {
    const span = trendMonths(months, DEFAULT_TREND_MONTHS);
    const { series, baseline, categories } = await repo.spendingTrend({ accountId, category, months: span });
    const currentMonth = series[series.length - 1];
    const lastCompleteMonth = series[series.length - 2];
    const hasBaseline = baseline.months > 0 && baseline.average > 0;
    const deltaPct = hasBaseline ? round1(((lastCompleteMonth.spent - baseline.average) / baseline.average) * 100) : null;
    const zScore = hasBaseline && baseline.stddev > 0 ? round2((lastCompleteMonth.spent - baseline.average) / baseline.stddev) : null;
    const trend = deltaPct === null ? 'sin_base' : deltaPct > TREND_STABLE_PCT ? 'sube' : deltaPct < -TREND_STABLE_PCT ? 'baja' : 'estable';
    const topChanges = categories
      .map((c) => ({
        ...c,
        delta: round2(c.lastMonth - c.baselineAvg),
        deltaPct: c.baselineAvg > 0 ? round1(((c.lastMonth - c.baselineAvg) / c.baselineAvg) * 100) : null,
      }))
      .filter((c) => c.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, TOP_CHANGES);
    // El resultado va al prompt del orquestador (8k tokens por minuto en Groq):
    // solo lo que la gráfica y el mensaje necesitan.
    const compact = ({ month, spent, movingAvg }) => ({ month, spent, movingAvg });
    return {
      months: span,
      ...(accountId ? { accountId } : {}),
      ...(category ? { category } : {}),
      series: series.map(compact),
      currentMonth: { ...compact(currentMonth), partial: true },
      lastCompleteMonth: compact(lastCompleteMonth),
      baseline,
      deltaPct,
      zScore,
      trend,
      // Dos desviaciones estándar: el mes se sale de lo habitual y vale la pena avisar.
      unusual: zScore !== null && Math.abs(zScore) >= UNUSUAL_Z,
      topChanges,
    };
  }

  // Próxima vez que toca un cargo mensual del día `dayOfMonth`: este mes si
  // todavía no llega, el siguiente si ya pasó o si el cargo de este mes ya está
  // registrado. Los meses cortos recorren el día al último del mes (un cargo el
  // 31 cae el 28 en febrero), y todo se calcula en UTC, que es el calendario en
  // el que el repositorio expone `date`.
  function nextOccurrence(dayOfMonth, lastDate, today) {
    const onMonth = (offset) => {
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth() + offset;
      // Día 0 del mes siguiente = último día de este mes.
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth)));
    };
    const thisMonth = onMonth(0);
    const alreadyCharged = lastDate && thisMonth.toISOString().slice(0, 10) <= lastDate;
    return alreadyCharged || thisMonth < today ? onMonth(1) : thisMonth;
  }

  // Pagos fijos detectados en los movimientos: qué se paga, qué día del mes,
  // cuánto en promedio y cuándo toca la próxima vez. Sin LLM de por medio: es
  // el patrón que ya está en la base.
  async function getRecurringPayments({ accountId, months } = {}) {
    const span = trendMonths(months, DEFAULT_TREND_MONTHS);
    const found = await repo.recurringPayments({
      accountId,
      months: span,
      minMonths: RECURRING_MIN_MONTHS,
      maxPerMonth: RECURRING_MAX_PER_MONTH,
      maxDayStddev: RECURRING_MAX_DAY_STDDEV,
    });
    const today = new Date(now().toISOString().slice(0, 10));
    const payments = found
      .map(({ dayStddev, ...payment }) => {
        const next = nextOccurrence(payment.dayOfMonth, payment.lastDate, today);
        return {
          ...payment,
          nextDate: next.toISOString().slice(0, 10),
          daysUntil: Math.round((next.getTime() - today.getTime()) / DAY_MS),
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil || b.averageAmount - a.averageAmount);
    const dueSoon = payments.filter((p) => p.daysUntil <= RECURRING_DUE_SOON_DAYS);
    return {
      months: span,
      ...(accountId ? { accountId } : {}),
      payments,
      count: payments.length,
      // Lo que se va cada mes en cargos fijos: la suma de los promedios.
      monthlyTotal: round2(payments.reduce((s, p) => s + p.averageAmount, 0)),
      dueSoon: {
        days: RECURRING_DUE_SOON_DAYS,
        count: dueSoon.length,
        total: round2(dueSoon.reduce((s, p) => s + p.averageAmount, 0)),
      },
    };
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

  // ---------- Reestructura de tarjeta (flujo A2UI de la demo) ----------

  // Cuenta de crédito objetivo: la indicada o la primera tarjeta del cliente.
  async function creditAccount(accountId) {
    if (accountId) {
      const account = await repo.findAccount(accountId);
      if (!account) return { error: `Cuenta no encontrada: ${accountId}` };
      if (account.type !== 'credit') return { error: `${account.name} no es una tarjeta de crédito.` };
      return { account };
    }
    const account = (await repo.listAccounts()).find((a) => a.type === 'credit');
    return account ? { account } : { error: 'El cliente no tiene tarjeta de crédito.' };
  }

  // Opciones para convertir el saldo de la tarjeta en un plan de pagos fijos a
  // tasa preferente. Los números son los que el cliente mueve en la pantalla
  // (slider de plazo): el cálculo del plan elegido lo repite el cliente con las
  // mismas fórmulas (renderer functions de A2UI), aquí van todos los plazos
  // para que el modelo no invente ninguno.
  async function getCardRestructureOptions({ accountId } = {}) {
    const found = await creditAccount(accountId);
    if (found.error) return { error: found.error };
    const { account } = found;
    const balance = round2(Math.abs(account.balance));
    if (balance <= 0) return { error: `${account.name} no tiene saldo por reestructurar.` };
    const cardRate = account.interestRate ?? DEFAULT_CARD_RATE;
    const options = RESTRUCTURE_TERMS.map((months) => {
      const plan = planFor(balance, months, RESTRUCTURE_ANNUAL_RATE);
      // Referencia: el mismo saldo pagado en el mismo plazo a la tasa de la tarjeta.
      const atCardRate = planFor(balance, months, cardRate);
      return { ...plan, interestAtCardRate: atCardRate.totalInterest, savings: round2(atCardRate.totalInterest - plan.totalInterest) };
    });
    return {
      accountId: account.id,
      name: account.name,
      balance,
      currentRate: cardRate,
      annualRate: RESTRUCTURE_ANNUAL_RATE,
      minimumPayment: account.minimumPayment ?? null,
      paymentDue: account.paymentDue ?? null,
      terms: RESTRUCTURE_TERMS,
      defaultMonths: 12,
      options,
      existingPlan: account.plan ?? null,
    };
  }

  // Aplica el plan (simulado). Misma compuerta que transfer_funds: `confirmed`
  // lo fija el servidor tras el evento confirm_restructure, nunca el modelo.
  async function restructureCardDebt({ accountId, months, confirmed }) {
    if (confirmed !== true) {
      return { error: 'La reestructura requiere confirmación explícita del usuario desde el botón "Aplicar plan".' };
    }
    const term = Number(months);
    if (!RESTRUCTURE_TERMS.includes(term)) {
      return { error: `El plazo debe ser uno de: ${RESTRUCTURE_TERMS.join(', ')} meses.` };
    }
    const found = await creditAccount(accountId);
    if (found.error) return { error: found.error };
    const { account } = found;
    const balance = round2(Math.abs(account.balance));
    if (balance <= 0) return { error: `${account.name} no tiene saldo por reestructurar.` };

    const plan = planFor(balance, term, RESTRUCTURE_ANNUAL_RATE);
    const date = new Date().toISOString().slice(0, 10);
    const folio = `REST-${Date.now().toString().slice(-6)}-${term}`;
    const applied = await repo.applyRestructure({
      accountId: account.id,
      plan: { folio, months: term, annualRate: RESTRUCTURE_ANNUAL_RATE, monthlyPayment: plan.monthlyPayment, balance, startedAt: date },
    });
    if (!applied.ok) return { error: 'No se pudo aplicar el plan.' };

    return {
      success: true,
      folio,
      accountId: account.id,
      name: account.name,
      balance,
      months: term,
      annualRate: RESTRUCTURE_ANNUAL_RATE,
      previousRate: account.interestRate ?? DEFAULT_CARD_RATE,
      monthlyPayment: plan.monthlyPayment,
      totalInterest: plan.totalInterest,
      totalPayment: plan.totalPayment,
      firstPaymentDate: applied.firstPaymentDate ?? null,
      date,
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
    getSpendingTrend,
    getMonthlyCashflow,
    getRecurringPayments,
    getInvestments,
    getExchangeRates,
    getBeneficiaries,
    listCreditProducts,
    simulateCredit,
    transferFunds,
    getCardRestructureOptions,
    restructureCardDebt,
    getPortfolio,
    getWatchlist,
    getPortfolioPerformance,
  };
}

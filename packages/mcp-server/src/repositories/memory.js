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

import * as bankSeed from '../data/mockData.js';
import * as marketSeed from '../data/marketData.js';

const FIRST_GENERATED_TX_ID = 1042;
const TRANSFER_CATEGORY = 'Transferencias';

const clone = (value) => structuredClone(value);
const round2 = (n) => Math.round(n * 100) / 100;

export function createMemoryRepository({ seed = bankSeed, market = marketSeed } = {}) {
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
  };
}

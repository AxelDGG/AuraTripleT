// Repositorio `tiger`: implementa el mismo contrato que `memory` sobre Tiger Data
// (Postgres + TimescaleDB). Los movimientos viven en la hypertable
// `transactions`; el resto son tablas de catálogo. Ver data/seeds/001_schema.sql.
//
// Nota sobre tipos: `pg` devuelve NUMERIC como string para no perder precisión.
// Aquí se convierte a Number en el borde (num()) porque el contrato que consumen
// las tools y el renderer es de números JS.

import pg from 'pg';

import { pgConnectionOptions } from './pg-options.js';

const { Pool } = pg;

const num = (value) => (value === null || value === undefined ? undefined : Number(value));
// DATE llega como Date de JS; el contrato usa 'YYYY-MM-DD' como en el seed.
const day = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? undefined));
// Quita las claves undefined para que las filas se vean igual que los objetos del
// mock: una cuenta de débito no trae creditLimit, no trae creditLimit: undefined.
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const mapAccount = (row) =>
  compact({
    id: row.id,
    type: row.type,
    name: row.name,
    number: row.number ?? undefined,
    clabe: row.clabe ?? undefined,
    currency: row.currency,
    balance: num(row.balance),
    availableBalance: num(row.available_balance),
    interestRate: num(row.interest_rate),
    creditLimit: num(row.credit_limit),
    availableCredit: num(row.available_credit),
    paymentDue: day(row.payment_due),
    minimumPayment: num(row.minimum_payment),
    noInterestPayment: num(row.no_interest_payment),
  });

const mapTransaction = (row) => ({
  id: row.id,
  accountId: row.account_id,
  date: row.ts.toISOString().slice(0, 10),
  description: row.description,
  category: row.category,
  amount: num(row.amount),
  type: row.type,
});

const ACCOUNT_COLUMNS = `id, type, name, number, clabe, currency, balance, available_balance,
  interest_rate, credit_limit, available_credit, payment_due, minimum_payment, no_interest_payment`;

const TRANSFER_CATEGORY = 'Transferencias';

export function createTigerRepository({ connectionString = process.env.DATABASE_URL, pool } = {}) {
  if (!pool && !connectionString) {
    throw new Error('BANK_DATA_SOURCE=tiger requiere DATABASE_URL (cadena de conexión de Tiger Cloud).');
  }

  const db =
    pool ??
    new Pool(
      pgConnectionOptions(connectionString, {
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    );

  const all = async (text, values) => (await db.query(text, values)).rows;
  const one = async (text, values) => (await db.query(text, values)).rows[0] ?? null;

  return {
    kind: 'tiger',

    async getCustomer() {
      const row = await one('SELECT * FROM customers ORDER BY id LIMIT 1');
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        segment: row.segment,
        rfc: row.rfc,
        email: row.email,
        phone: row.phone,
        branch: row.branch,
        creditScore: row.credit_score,
        customerSince: day(row.customer_since),
      };
    },

    async listAccounts() {
      return (await all(`SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY id`)).map(mapAccount);
    },

    async findAccount(id) {
      const row = await one(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1`, [id]);
      return row ? mapAccount(row) : null;
    },

    // Filtros opcionales resueltos en SQL: el índice (account_id, ts DESC) de la
    // hypertable da el orden sin ordenar en memoria.
    async listTransactions({ accountId, category, limit } = {}) {
      const where = [];
      const values = [];
      if (accountId) {
        values.push(accountId);
        where.push(`account_id = $${values.length}`);
      }
      if (category) {
        values.push(category);
        where.push(`lower(category) = lower($${values.length})`);
      }
      let sql = 'SELECT id, ts, account_id, description, category, amount, type FROM transactions';
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY ts DESC, id DESC';
      if (limit) {
        values.push(limit);
        sql += ` LIMIT $${values.length}`;
      }
      return (await all(sql, values)).map(mapTransaction);
    },

    async listInvestments() {
      return (await all('SELECT * FROM investments ORDER BY id')).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        amount: num(row.amount),
        rate: num(row.rate),
        maturity: row.maturity ? day(row.maturity) : null,
        gain: num(row.gain),
      }));
    },

    async listExchangeRates() {
      const rows = await all('SELECT * FROM exchange_rates ORDER BY ord, currency');
      return {
        base: rows[0]?.base ?? 'MXN',
        updatedAt: rows[0]?.updated_at?.toISOString() ?? new Date().toISOString(),
        rates: rows.map((row) => ({
          currency: row.currency,
          name: row.name,
          buy: num(row.buy),
          sell: num(row.sell),
        })),
      };
    },

    async listBeneficiaries() {
      return all('SELECT id, name, bank, clabe, alias FROM beneficiaries ORDER BY id');
    },

    async findBeneficiary(id) {
      return one('SELECT id, name, bank, clabe, alias FROM beneficiaries WHERE id = $1', [id]);
    },

    async listCreditProducts() {
      return (await all('SELECT * FROM credit_products ORDER BY id')).map(mapCreditProduct);
    },

    async findCreditProduct(id) {
      const row = await one('SELECT * FROM credit_products WHERE id = $1', [id]);
      return row ? mapCreditProduct(row) : null;
    },

    async listHoldings() {
      return (await all('SELECT * FROM holdings ORDER BY symbol')).map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        units: row.units,
        price: num(row.price),
        changePct: num(row.change_pct),
      }));
    },

    async listWatchlist() {
      return (await all('SELECT * FROM watchlist ORDER BY views DESC, symbol')).map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        price: num(row.price),
        changePct: num(row.change_pct),
        views: row.views,
      }));
    },

    // Transferencia atómica: el equivalente SQL de la verificación de saldo del
    // repositorio en memoria. La condición de saldo va en el WHERE del UPDATE,
    // así que dos transferencias concurrentes no pueden cobrar el mismo saldo —
    // la segunda no encuentra fila y devuelve insufficient_funds.
    async applyTransfer({ fromAccountId, toAccountId, amount, date, debitDescription, creditDescription }) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const debited = await client.query(
          `UPDATE accounts
              SET balance = balance - $2,
                  available_balance = available_balance - $2
            WHERE id = $1 AND COALESCE(available_balance, 0) >= $2
        RETURNING balance`,
          [fromAccountId, amount],
        );

        if (debited.rowCount === 0) {
          const source = await client.query('SELECT available_balance FROM accounts WHERE id = $1', [fromAccountId]);
          await client.query('ROLLBACK');
          if (source.rowCount === 0) return { ok: false, reason: 'account_not_found' };
          return {
            ok: false,
            reason: 'insufficient_funds',
            availableBalance: num(source.rows[0].available_balance) ?? 0,
          };
        }

        // Solo se abona a cuentas propias que no sean de crédito (igual que `memory`).
        const destination = toAccountId
          ? await client.query('SELECT type FROM accounts WHERE id = $1', [toAccountId])
          : { rowCount: 0, rows: [] };
        const creditsDestination = destination.rowCount > 0 && destination.rows[0].type !== 'credit';

        if (creditsDestination) {
          await client.query(
            `UPDATE accounts
                SET balance = balance + $2,
                    available_balance = COALESCE(available_balance, 0) + $2
              WHERE id = $1`,
            [toAccountId, amount],
          );
        }

        const ts = `${date}T12:00:00-06:00`;
        const debitTx = await client.query(
          `INSERT INTO transactions (id, ts, account_id, description, category, amount, type)
           VALUES ('TX-' || nextval('transaction_id_seq'), $1, $2, $3, $4, $5, 'debit')
           RETURNING id`,
          [ts, fromAccountId, debitDescription, TRANSFER_CATEGORY, -amount],
        );

        let creditTransactionId = null;
        if (creditsDestination) {
          const creditTx = await client.query(
            `INSERT INTO transactions (id, ts, account_id, description, category, amount, type)
             VALUES ('TX-' || nextval('transaction_id_seq'), $1, $2, $3, $4, $5, 'credit')
             RETURNING id`,
            [ts, toAccountId, creditDescription, TRANSFER_CATEGORY, amount],
          );
          creditTransactionId = creditTx.rows[0].id;
        }

        await client.query('COMMIT');
        return {
          ok: true,
          debitTransactionId: debitTx.rows[0].id,
          creditTransactionId,
          newBalance: num(debited.rows[0].balance),
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    // Reestructura (simulada). La tabla `accounts` no tiene columna para el
    // plan completo, así que persiste lo que sí existe: la mensualidad pasa a
    // ser el pago del plan y la tasa, la del plan. El detalle del plan vive en
    // la respuesta de la tool y en la superficie archivada en `ui_history`.
    async applyRestructure({ accountId, plan }) {
      const updated = await db.query(
        `UPDATE accounts
            SET minimum_payment = $2,
                interest_rate = $3
          WHERE id = $1 AND type = 'credit'
      RETURNING payment_due`,
        [accountId, plan.monthlyPayment, plan.annualRate],
      );
      if (updated.rowCount === 0) return { ok: false, reason: 'account_not_found' };
      return { ok: true, firstPaymentDate: day(updated.rows[0].payment_due) ?? plan.startedAt };
    },

    // Solo cierra el pool si lo creó este repositorio (en tests se inyecta uno).
    async close() {
      if (!pool) await db.end();
    },
  };
}

function mapCreditProduct(row) {
  return {
    id: row.id,
    name: row.name,
    minRate: num(row.min_rate),
    maxRate: num(row.max_rate),
    maxMonths: row.max_months,
    maxAmount: num(row.max_amount),
  };
}

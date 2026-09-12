// Genera data/seeds/002_seed.sql a partir de los seeds sintéticos de
// packages/mcp-server/src/data/. Así el SQL que se carga en Tiger Data nunca se
// desincroniza del mock que usa el repositorio `memory`.
//
//   npm run db:build-seed -w @norte/mcp-server

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as bank from '../src/data/mockData.js';
import * as market from '../src/data/marketData.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../data/seeds/002_seed.sql');

// Literales SQL: null explícito, escape de comillas simples, numéricos sin comillas.
const lit = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const insert = (table, columns, rows, conflictKey) => {
  if (!rows.length) return '';
  const values = rows.map((row) => `  (${columns.map((c) => lit(row[c])).join(', ')})`).join(',\n');
  const updates = columns
    .filter((c) => !conflictKey.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values}\n` +
    `ON CONFLICT (${conflictKey.join(', ')}) DO UPDATE SET ${updates};\n`
  );
};

const customerId = bank.customer.id;
// Los movimientos del mock traen fecha sin hora; se fijan a mediodía hora del
// centro de México para que el bucket diario caiga en el día correcto en UTC.
const tsOf = (date) => `${date}T12:00:00-06:00`;

const parts = [
  '-- Norte AI · Seed del cliente demo para Tiger Data.',
  '-- ARCHIVO GENERADO por packages/mcp-server/scripts/build-seed.js — no editar a mano.',
  '-- Datos 100% sintéticos: ningún dato real ni PII.',
  '',
  'BEGIN;',
  '',
  insert(
    'customers',
    ['id', 'name', 'segment', 'rfc', 'email', 'phone', 'branch', 'credit_score', 'customer_since'],
    [
      {
        id: bank.customer.id,
        name: bank.customer.name,
        segment: bank.customer.segment,
        rfc: bank.customer.rfc,
        email: bank.customer.email,
        phone: bank.customer.phone,
        branch: bank.customer.branch,
        credit_score: bank.customer.creditScore,
        customer_since: bank.customer.customerSince,
      },
    ],
    ['id'],
  ),
  insert(
    'accounts',
    [
      'id', 'customer_id', 'type', 'name', 'number', 'clabe', 'currency', 'balance',
      'available_balance', 'interest_rate', 'credit_limit', 'available_credit',
      'payment_due', 'minimum_payment', 'no_interest_payment',
    ],
    bank.accounts.map((a) => ({
      id: a.id,
      customer_id: customerId,
      type: a.type,
      name: a.name,
      number: a.number ?? null,
      clabe: a.clabe ?? null,
      currency: a.currency,
      balance: a.balance,
      available_balance: a.availableBalance ?? null,
      interest_rate: a.interestRate ?? null,
      credit_limit: a.creditLimit ?? null,
      available_credit: a.availableCredit ?? null,
      payment_due: a.paymentDue ?? null,
      minimum_payment: a.minimumPayment ?? null,
      no_interest_payment: a.noInterestPayment ?? null,
    })),
    ['id'],
  ),
  insert(
    'beneficiaries',
    ['id', 'customer_id', 'name', 'bank', 'clabe', 'alias'],
    bank.beneficiaries.map((b) => ({ ...b, customer_id: customerId })),
    ['id'],
  ),
  insert(
    'credit_products',
    ['id', 'name', 'min_rate', 'max_rate', 'max_months', 'max_amount'],
    bank.creditProducts.map((p) => ({
      id: p.id,
      name: p.name,
      min_rate: p.minRate,
      max_rate: p.maxRate,
      max_months: p.maxMonths,
      max_amount: p.maxAmount,
    })),
    ['id'],
  ),
  insert(
    'investments',
    ['id', 'customer_id', 'name', 'type', 'amount', 'rate', 'maturity', 'gain'],
    bank.investments.map((i) => ({ ...i, customer_id: customerId, maturity: i.maturity ?? null })),
    ['id'],
  ),
  insert(
    'exchange_rates',
    ['currency', 'base', 'name', 'buy', 'sell', 'updated_at', 'ord'],
    bank.exchangeRates.rates.map((r, index) => ({
      ...r,
      base: bank.exchangeRates.base,
      updated_at: bank.exchangeRates.updatedAt,
      ord: index,
    })),
    ['currency'],
  ),
  insert(
    'holdings',
    ['symbol', 'name', 'exchange', 'units', 'price', 'change_pct'],
    market.holdings.map((h) => ({ ...h, change_pct: h.changePct })),
    ['symbol'],
  ),
  insert(
    'watchlist',
    ['symbol', 'name', 'exchange', 'price', 'change_pct', 'views'],
    market.watchlist.map((w) => ({ ...w, change_pct: w.changePct })),
    ['symbol'],
  ),
  insert(
    'transactions',
    ['id', 'ts', 'account_id', 'description', 'category', 'amount', 'type'],
    bank.transactions.map((t) => ({
      id: t.id,
      ts: tsOf(t.date),
      account_id: t.accountId,
      description: t.description,
      category: t.category,
      amount: t.amount,
      type: t.type,
    })),
    ['id', 'ts'],
  ),
  'COMMIT;',
  '',
];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log(`data/seeds/002_seed.sql escrito (${bank.transactions.length} movimientos).`);

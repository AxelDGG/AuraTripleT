-- Norte AI · Esquema operacional en Tiger Data (Postgres + TimescaleDB).
--
-- Dos familias de tablas:
--   1. Catálogo relacional del cliente demo (customers, accounts, beneficiaries,
--      credit_products, investments, exchange_rates, holdings, watchlist).
--   2. Series de tiempo en hypertables: `transactions` (movimientos bancarios) y
--      `ui_history` (historial de visualizaciones generadas por el agente).
--
-- Idempotente: se puede correr varias veces sobre la misma base.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Toolkit: stats_agg/average/stddev para la tendencia de gasto (get_spending_trend).
CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit;
-- pgvector: embeddings de la memoria del agente (customer_memory).
CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Catálogo =====

CREATE TABLE IF NOT EXISTS customers (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  segment        text,
  rfc            text,
  email          text,
  phone          text,
  branch         text,
  credit_score   integer,
  customer_since date
);

CREATE TABLE IF NOT EXISTS accounts (
  id                   text PRIMARY KEY,
  customer_id          text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type                 text NOT NULL CHECK (type IN ('checking', 'savings', 'credit')),
  name                 text NOT NULL,
  number               text,
  clabe                text,
  currency             text NOT NULL DEFAULT 'MXN',
  -- Saldos en numeric: nunca float, para que no se pierdan centavos.
  balance              numeric(14, 2) NOT NULL DEFAULT 0,
  available_balance    numeric(14, 2),
  interest_rate        numeric(6, 2),
  credit_limit         numeric(14, 2),
  available_credit     numeric(14, 2),
  payment_due          date,
  minimum_payment      numeric(14, 2),
  no_interest_payment  numeric(14, 2)
);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id          text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  bank        text,
  clabe       text,
  alias       text
);

CREATE TABLE IF NOT EXISTS credit_products (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  min_rate   numeric(6, 2) NOT NULL,
  max_rate   numeric(6, 2) NOT NULL,
  max_months integer NOT NULL,
  max_amount numeric(14, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS investments (
  id          text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text,
  amount      numeric(14, 2) NOT NULL,
  rate        numeric(6, 2),
  maturity    date,
  gain        numeric(14, 2)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency   text PRIMARY KEY,
  base       text NOT NULL DEFAULT 'MXN',
  name       text NOT NULL,
  buy        numeric(10, 4) NOT NULL,
  sell       numeric(10, 4) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- El orden en que se muestran (USD primero, no alfabético): la tabla es un
  -- catálogo corto y presentarlo ordenado por relevancia es parte del contrato.
  ord        integer NOT NULL DEFAULT 0
);

-- CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe, así que las
-- columnas agregadas después del primer despliegue se migran aparte.
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS ord integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS holdings (
  symbol     text PRIMARY KEY,
  name       text NOT NULL,
  exchange   text,
  units      integer NOT NULL,
  price      numeric(12, 2) NOT NULL,
  change_pct numeric(6, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS watchlist (
  symbol     text PRIMARY KEY,
  name       text NOT NULL,
  exchange   text,
  price      numeric(12, 2) NOT NULL,
  change_pct numeric(6, 2) NOT NULL DEFAULT 0,
  views      integer NOT NULL DEFAULT 0
);

-- ===== Series de tiempo =====

-- Movimientos bancarios. La clave primaria incluye `ts` porque TimescaleDB
-- exige que la columna de particionado forme parte de todo índice único.
CREATE TABLE IF NOT EXISTS transactions (
  id          text NOT NULL,
  ts          timestamptz NOT NULL,
  account_id  text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL,
  amount      numeric(14, 2) NOT NULL,
  type        text NOT NULL CHECK (type IN ('debit', 'credit')),
  PRIMARY KEY (id, ts)
);

SELECT create_hypertable('transactions', by_range('ts', INTERVAL '30 days'),
  if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS transactions_account_ts_idx  ON transactions (account_id, ts DESC);
CREATE INDEX IF NOT EXISTS transactions_category_ts_idx ON transactions (category, ts DESC);

-- Historial de visualizaciones generadas por el agente. Es lo que alimenta el
-- carrusel central y las carpetas del panel derecho: `folder` es la carpeta que
-- eligió la IA y `spec` el Norte UI Spec completo que renderiza el front.
CREATE TABLE IF NOT EXISTS ui_history (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  customer_id text NOT NULL,
  folder      text NOT NULL,
  title       text NOT NULL,
  prompt      text,
  message     text,
  spec        jsonb NOT NULL,
  PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('ui_history', by_range('created_at', INTERVAL '7 days'),
  if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ui_history_folder_idx ON ui_history (folder, created_at DESC);
-- Búsqueda por título del panel derecho ("BUSCAR POR TITULO"): trigramas para
-- que tolere acentos parciales y coincidencias en medio de la palabra.
CREATE INDEX IF NOT EXISTS ui_history_title_trgm_idx ON ui_history USING gin (title gin_trgm_ops);

-- Los movimientos que genera la app (transferencias) continúan la numeración del
-- seed, que llega hasta TX-1041.
CREATE SEQUENCE IF NOT EXISTS transaction_id_seq START 1042;

-- ===== Agregado continuo: gasto por categoría y mes =====
-- Es el cálculo que más pide el agente (get_spending_by_category). TimescaleDB lo
-- mantiene incrementalmente, así que la gráfica no vuelve a escanear el histórico.
CREATE MATERIALIZED VIEW IF NOT EXISTS spending_by_category_monthly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 month', ts) AS month,
  account_id,
  category,
  sum(-amount) AS spent,
  count(*)     AS movements
FROM transactions
WHERE amount < 0
GROUP BY month, account_id, category
WITH NO DATA;

SELECT add_continuous_aggregate_policy('spending_by_category_monthly',
  start_offset => INTERVAL '12 months',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

-- Tiempo real: la policy deja fuera la última hora, así que sin esto una
-- transferencia hecha durante la demo no aparecería en la gráfica hasta el
-- siguiente refresh. Con materialized_only = false TimescaleDB suma al vuelo
-- lo que entró después de la marca de materialización.
ALTER MATERIALIZED VIEW spending_by_category_monthly SET (timescaledb.materialized_only = false);

-- ===== Agregado continuo: flujo de efectivo mensual =====
-- Ingresos y gastos por mes y cuenta (get_monthly_cashflow). Mismo esquema de
-- refresh que el de categorías; ambos alimentan también get_spending_trend.
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_cashflow
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 month', ts) AS month,
  account_id,
  sum(CASE WHEN amount > 0 THEN amount ELSE 0 END)  AS income,
  sum(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses,
  count(*)                                          AS movements
FROM transactions
GROUP BY month, account_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('monthly_cashflow',
  start_offset => INTERVAL '12 months',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

ALTER MATERIALIZED VIEW monthly_cashflow SET (timescaledb.materialized_only = false);

-- ===== Memoria del agente =====
-- Hechos duraderos que el agente aprende de cada conversación ("prefiere plazos
-- cortos", "Ana es su casera") para personalizar los turnos siguientes. Cada
-- fila lleva su embedding (Gemini, 768 dims) y se recupera por similitud coseno
-- con la pregunta en curso; el índice HNSW de pgvector es el que hace la
-- búsqueda. Es una tabla normal, no una hypertable: son decenas de filas por
-- cliente y se consultan por parecido, no por rango de tiempo.
CREATE TABLE IF NOT EXISTS customer_memory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  uses         integer NOT NULL DEFAULT 0,
  kind         text NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact', 'preference', 'goal', 'context')),
  content      text NOT NULL,
  source       text NOT NULL DEFAULT 'agent',
  embedding    vector(768)
);

CREATE INDEX IF NOT EXISTS customer_memory_customer_idx  ON customer_memory (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_memory_embedding_idx ON customer_memory USING hnsw (embedding vector_cosine_ops);

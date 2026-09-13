-- ============================================================================
-- Snowflake: capa analítica del reto (benchmarks de pares + Cortex).
-- Dataset poblacional SINTÉTICO: miles de clientes ficticios, 24 meses de gasto
-- por categoría. Nada de esto son datos reales.
--
-- Carga sugerida:
--   1. npm run peer:seed      → genera data/snowflake/peer_*.csv
--   2. Crear la base/schema y correr este archivo (Create / Run All).
--   3. Subir los CSVs a una stage interna y hacer COPY INTO de las dos tablas:
--        PUT file://data/snowflake/peer_customers.csv @~peer_stage;
--        PUT file://data/snowflake/peer_spending.csv  @~peer_stage;
--        COPY INTO peer_customers FROM @~peer_stage/peer_customers.csv
--          FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1);
--        COPY INTO peer_spending FROM @~peer_stage/peer_spending.csv
--          FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1);
-- ============================================================================

CREATE TABLE IF NOT EXISTS peer_customers (
  customer_id VARCHAR(16) NOT NULL PRIMARY KEY,
  segment    VARCHAR(16) NOT NULL,          -- Personal | Preferente | Premier
  income     NUMBER(12,2),
  age        INTEGER,
  city       VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS peer_spending (
  customer_id VARCHAR(16) NOT NULL,
  month       DATE NOT NULL,                -- primer día del mes
  category    VARCHAR(40) NOT NULL,
  amount      NUMBER(12,2),
  PRIMARY KEY (customer_id, month, category)
);

-- Probabilidades por categoría y segmento para el semantic model de Cortex
-- Analyst (un archivo YAML separado, ver data/snowflake/README o el reto).
CREATE OR REPLACE VIEW v_peer_spending_percentiles AS
WITH w AS (
  SELECT c.segment, p.category, p.month, p.amount
  FROM peer_spending p
  JOIN peer_customers c ON c.customer_id = p.customer_id
)
SELECT segment, category,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount), 2) AS p25,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY amount), 2) AS p50,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount), 2) AS p75,
  ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY amount), 2) AS p90,
  COUNT(*) AS peers
FROM w
GROUP BY segment, category;

-- ---------------------------------------------------------------------------
-- Cortex: LLM dentro de Snowflake (el agente las ejecuta como consulta SQL).
-- Ejemplos que usa get_peer_benchmark en vivo:
-- ---------------------------------------------------------------------------

-- 1) La lectura en lenguaje natural del benchmark de pares:
SELECT SNOWFLAKE.CORTEX.COMPLETE(
  'llama-3.3-70b',
  'Cliente del segmento Preferente: su promedio mensual es mayor que la mediana.
   Escribe una frase en español mexicano, natural y accionable, de máximo 2 oraciones.'
) AS insight;

-- 2) Resumen del gasto por categoría con AI_AGG (SQL semántico sobre la tabla):
SELECT SNOWFLAKE.CORTEX.AI_AGG(
  'analítica de gastos de clientes Banorte',
  '¿Cuánto gasta en promedio un cliente Preferente en Restaurantes al mes?',
  'peer_spending'
) AS answer;

-- 3) Categorizar descripciones de comercio con AI_CLASSIFY (también vía SQL):
SELECT description,
  SNOWFLAKE.CORTEX.AI_CLASSIFY(
    description,
    ['Restaurantes','Supermercado','Transporte','Entretenimiento','Otro']
  ) AS category
FROM (SELECT 'Starbucks San Pedro' AS description UNION SELECT 'Uber Eats');

-- Vista que el repositorio consume para el percentil del cliente:
--   SELECT category, p25, p50, p75, p90
--   FROM v_peer_spending_percentiles
--   WHERE segment = 'Preferente' AND month >= DATEADD(month, -5, DATE '2026-09-01');
-- (los percentiles por ventana se calculan inline; esta vista es la referencia.)
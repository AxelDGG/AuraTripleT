// Repositorio analítico de Snowflake.
//
// No duplica el repositorio transaccional: Snowflake es la capa analítica del
// proyecto (benchmarks de pares + Cortex), así que el resto del contrato se
// delega al repositorio local (memory por defecto o tiger con DATABASE_URL).
//
// peerBenchmark({ customer, spending, months }):
//  - Sin SNOWFLAKE_*: resuelve el benchmark con la población sintética local
//    (mismo motor que alimenta los CSVs de data/snowflake/) y lo marca
//    `source: 'sample-population'`. La demo nunca depende de red.
//  - Con SNOWFLAKE_*: ejecuta dos consultas por la SQL REST API:
//      1) percentiles reales de la tabla `peer_spending` con ventanas SQL;
//      2) la lectura en lenguaje natural con SNOWFLAKE.CORTEX.COMPLETE.
//    Devuelve `source: 'snowflake'`, las consultas en `evidence.sql` y la frase
//    de ejemplo para mostrarla en la UI ("una consulta Cortex visible").

import { createMemoryRepository } from './memory.js';
import { createSnowflakeRest } from '../services/snowflake-rest.js';
import { computePeerBenchmark, buildInsight, PEER_CATEGORIES } from '../data/peers.js';

const CORTEX_MODEL = 'llama-3.3-70b';

function percentileSql({ segment, span }) {
  return `-- Percentiles por categoría para el segmento (ventana SQL)
WITH w AS (
  SELECT p.category, p.amount
  FROM peer_spending p
  JOIN peer_customers c ON c.customer_id = p.customer_id
  WHERE c.segment = '${segment}'
    AND p.month >= DATEADD(month, -${span - 1}, '2026-09-01')
)
SELECT category,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount), 2) AS p25,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY amount), 2) AS p50,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount), 2) AS p75,
  ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY amount), 2) AS p90
FROM w
GROUP BY category
ORDER BY category;`;
}

function cortexSql({ segment, span, category, mine, p50, percentile }) {
  return `-- Lectura con Cortex (LLM dentro de Snowflake): una sola llamada SQL
SELECT SNOWFLAKE.CORTEX.COMPLETE(
  '${CORTEX_MODEL}',
  'Cliente del segmento ${segment}: en los últimos ${span} meses su promedio
   mensual en ${category} es $${mine.toFixed(2)} (percentil ${Math.round(percentile ?? 0)}
   del segmento, mediana $${p50.toFixed(2)}). Escribe una frase en español
   mexicano, natural y accionable, de máximo 2 oraciones, sin listas.'
) AS insight;`;
}

function offlinePeerBenchmark({ customer, spending, months }) {
  const result = computePeerBenchmark({ customer, spending, months });
  return {
    ...result,
    source: 'sample-population',
    provenance: {
      engine: 'generative-population-local',
      cortex: null,
      note: 'SNOWFLAKE_* sin configurar: benchmark con población sintética local de la misma forma que los CSVs de data/snowflake/. Configura las credenciales en .env para servir los percentiles desde la SQL API + Cortex.',
    },
    evidence: null,
  };
}

export function createSnowflakeRepository({
  bank = createMemoryRepository(),
  rest = createSnowflakeRest(),
  logger = console.error,
} = {}) {
  async function peerBenchmark({ customer, spending, months = 6 } = {}) {
    const span = Math.min(Math.max(Math.trunc(months) || 6, 3), 12);
    if (!rest.configured) {
      return offlinePeerBenchmark({ customer, spending, months: span });
    }

    try {
      const segment = customer?.segment ?? 'Preferente';
      // 1) Percentiles reales desde Snowflake (ventana SQL).
      const stats = await rest.execute(percentileSql({ segment, span }));
      const map = new Map(stats.rows.map((r) => [r.category, r]));
      const spend = new Map(spending.map((c) => [c.category, Number(c.total) || 0]));
      const rows = PEER_CATEGORIES.map((cat) => {
        const row = map.get(cat);
        const mine = (spend.get(cat) || 0) / span;
        const p50 = row?.p50 ?? null;
        const subtotal = spend.get(cat) || 0;
        const lower = stats.rows.filter((r) => (r.p50 ?? 0) < subtotal).length;
        const denominator = stats.rows.length || 1;
        return {
          category: cat,
          mine: Math.round(mine * 100) / 100,
          p25: row?.p25 ?? null,
          p50,
          p75: row?.p75 ?? null,
          p90: row?.p90 ?? null,
          percentile: p50 ? Math.round(((lower / denominator) * 100) * 10) / 10 : null,
          deltaPct: p50 > 0 ? Math.round(((mine - p50) / p50) * 1000) / 10 : null,
        };
      }).filter((r) => r.p50 !== null);
      rows.sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0));
      const lead = rows.find((r) => r.mine > r.p50 && r.percentile !== null) ?? rows[0] ?? null;

      // 2) Cuántos pares hay en el segmento (para el encabezado de la gráfica
      //    y para la frase si Cortex no está disponible).
      const count = await rest.execute(
        `SELECT COUNT(*) AS n FROM peer_customers WHERE segment = '${segment}';`,
      );
      const population = count.rows[0]?.n ?? null;

      // 3) Corto la lectura con Cortex (LLM dentro de Snowflake). No todos los
      // trials/regiones la habilitan (COMPLETE puede estar bloqueado): si falla,
      // los percentiles de arriba se conservan y la frase sale con los valores
      // reales que ya sacó la SQL, dejando el error a la vista para la demo.
      let cortex = { rows: [], sql: null, error: null };
      let insight;
      if (lead) {
        const cortexSqlText = cortexSql({ segment, span, category: lead.category, mine: lead.mine, p50: lead.p50 ?? 0, percentile: lead.percentile });
        try {
          cortex = await rest.execute(cortexSqlText);
          insight = cortex.rows[0]?.insight;
        } catch (cortexErr) {
          cortex = { rows: [], sql: cortexSqlText, error: String(cortexErr.message || cortexErr) };
          logger(`[norte] Cortex COMPLETE no disponible en esta cuenta; insight local: ${cortex.error}`);
        }
      }
      const summary = lead
        ? {
            category: lead.category,
            percentile: lead.percentile,
            mine: lead.mine,
            p50: lead.p50,
            deltaPct: lead.deltaPct,
            drawing: lead.percentile >= 75 ? 'más' : lead.percentile <= 25 ? 'menos' : 'como',
          }
        : null;
      if (!insight) {
        insight = summary
          ? buildInsight(segment, span, summary, population ?? rows.length)
          : 'No hay categorías con las que compararte en este periodo.';
      }

      return {
        cohort: { segment, months: span, windowLabel: `últimos ${span} meses (promedio mensual)`, population },
        summary,
        categories: rows,
        insight,
        source: 'snowflake',
        cortex: { model: CORTEX_MODEL, sql: cortex.sql, error: cortex.error ?? null },
        provenance: {
          engine: 'snowflake-sql-api',
          cortex: `SNOWFLAKE.CORTEX.COMPLETE('${CORTEX_MODEL}', …)`,
        },
        evidence: {
          sql: [percentileSql({ segment, span }), cortexSql({ segment, span, category: lead?.category ?? '', mine: lead?.mine ?? 0, p50: lead?.p50 ?? 0, percentile: lead?.percentile ?? 0 })],
        },
      };
    } catch (err) {
      logger(`[norte] Snowflake no respondió; usando población local: ${err.message}`);
      return offlinePeerBenchmark({ customer, spending, months: span });
    }
  }

  // El contrato transaccional vive en el repositorio local (Snowflake no se
  // usa para datos operacionales en esta demo).
  return { ...bank, kind: 'snowflake', peerBenchmark };
}
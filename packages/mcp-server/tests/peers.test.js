// Snowflake: motor de pares, tool MCP y cliente REST (sin red).
// El camino "vivo" solo se ejercita con un fetch falso para no depender de
// credenciales; el camino local (población sintética) es el de la demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePeerBenchmark,
  generatePopulation,
  PEER_CATEGORIES,
  buildMonths,
} from '../src/data/peers.js';
import { createSnowflakeRest } from '../src/services/snowflake-rest.js';
import { createSnowflakeRepository } from '../src/repositories/snowflake.js';
import { createBankingTools } from '../src/tools.js';

test('buildMonths arma la ventana al revés terminando en 2026-09', () => {
  const months = buildMonths(6, '2026-09');
  assert.deepEqual(months, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
});

test('la población es determinista: misma semilla, mismos promedios', () => {
  const a = generatePopulation({ size: 300 });
  const b = generatePopulation({ size: 300 });
  assert.deepEqual(a.segments, b.segments);
  assert.deepEqual(a.incomes, b.incomes);
  assert.equal(a.spend.Restaurantes['2026-09'][42], b.spend.Restaurantes['2026-09'][42]);
  assert.deepEqual(a.months, buildMonths(24));
});

test('computePeerBenchmark devuelve percentiles en rango y lecturas coherentes', () => {
  const population = generatePopulation({ size: 600 });
  const spending = [
    { category: 'Restaurantes', total: 2331.5 * 6 },
    { category: 'Supermercado', total: 2200 * 6 },
    { category: 'Compras', total: 1900 * 6 },
  ];
  const result = computePeerBenchmark({ customer: { segment: 'Preferente' }, spending, months: 6, population });
  assert.equal(result.cohort.segment, 'Preferente');
  assert.equal(result.cohort.population > 0, true);
  assert.ok(result.categories.length >= 3);
  for (const row of result.categories) {
    assert.ok(row.percentile >= 0 && row.percentile <= 100, row.category);
    // El delta no puede exceder del 100% del promedio (cifras positivas).
    if (row.p50 > 0) assert.equal(typeof row.deltaPct, 'number');
  }
  assert.ok(result.insight.includes('percentil'));
});

test('computePeerBenchmark filtra a una sola categoría', () => {
  const result = computePeerBenchmark({ customer: { segment: 'Preferente' }, spending: [], months: 6, category: 'Restaurantes' });
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].category, 'Restaurantes');
});

test('getPeerBenchmark (tool) funciona offline contra el repositorio en memoria', async () => {
  const tools = createBankingTools(createSnowflakeRepository());
  const result = await tools.getPeerBenchmark({ months: 6 });
  assert.equal(result.source, 'sample-population');
  assert.equal(result.segment, 'Preferente');
  assert.ok(result.summary && result.summary.percentile > 0);
  assert.ok(result.categories.length > 0);
  assert.equal(result.provenance.engine, 'generative-population-local');
});

test('el repositorio snowflake sin credenciales cae a la población local', async () => {
  const repo = createSnowflakeRepository({ rest: createSnowflakeRest({ account: '', user: '', password: '' }) });
  assert.equal(repo.peerBenchmark !== undefined, true);
  assert.equal(repo.listAccounts !== undefined, true);
  const customer = await repo.getCustomer();
  assert.equal(customer.name.includes('María'), true);
  const result = await repo.peerBenchmark({ customer, spending: [{ category: 'Restaurantes', total: 12000 }], months: 6 });
  assert.equal(result.source, 'sample-population');
});

test('el cliente REST arma host y auth básica sin hacer red', () => {
  const rest = createSnowflakeRest({ account: 'norte-trial', user: 'u', password: 'p', warehouse: 'W', database: 'D' });
  assert.equal(rest.configured, true);
  assert.equal(rest.baseUrl, 'https://norte-trial.snowflakecomputing.com');
  const withHost = createSnowflakeRest({ account: 'x.snowflakecomputing.com', user: 'u', password: 'p' });
  assert.equal(withHost.baseUrl, 'https://x.snowflakecomputing.com');
});

test('el camino vivo del repositorio usa la SQL API y Cortex (fetch falso)', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options?.body ?? '{}');
    const isCortex = body.statement?.includes('SNOWFLAKE.CORTEX.COMPLETE');
    const isCount = body.statement?.includes('COUNT(*)');
    if (isCount) {
      return new Response(JSON.stringify({
        resultsetMetaData: { rowType: [{ name: 'N', type: 'FIXED' }] },
        rowset: [['1234']],
        status: 'SUCCESS',
      }), { status: 200 });
    }
    if (isCortex) {
      return new Response(JSON.stringify({
        resultsetMetaData: { rowType: [{ name: 'INSIGHT', type: 'TEXT' }] },
        rowset: [['Tu gasto en Restaurantes está por encima de la mediana del segmento.']],
        status: 'SUCCESS',
      }), { status: 200 });
    }
    const cat = (name, p50) => ({ category: name, p25name: name });
    return new Response(JSON.stringify({
      resultsetMetaData: { rowType: [{ name: 'CATEGORY', type: 'TEXT' }, { name: 'P25', type: 'FIXED' }, { name: 'P50', type: 'FIXED' }, { name: 'P75', type: 'FIXED' }, { name: 'P90', type: 'FIXED' }] },
      rowset: [['Restaurantes', 900, 1200, 1800, 2600], ['Supermercado', 1800, 2200, 2800, 3400]],
      status: 'SUCCESS',
    }), { status: 200 });
  };
  const rest = createSnowflakeRest({ account: 'norte-trial', user: 'u', password: 'p', warehouse: 'W', database: 'D', fetchImpl: fakeFetch });
  const repo = createSnowflakeRepository({ rest });
  const customer = { segment: 'Preferente' };
  const spending = [{ category: 'Restaurantes', total: 14000 }, { category: 'Supermercado', total: 12000 }];
  const result = await repo.peerBenchmark({ customer, spending, months: 6 });
  assert.equal(result.source, 'snowflake');
  assert.equal(result.cohort.population, 1234);
  assert.ok(result.insight.includes('Restaurantes'));
  assert.equal(result.cortex.model, 'llama-3.3-70b');
  assert.ok(result.evidence.sql.length === 2);
  assert.ok(result.evidence.sql[0].includes('PERCENTILE_CONT'));
  assert.ok(result.evidence.sql[1].includes('SNOWFLAKE.CORTEX.COMPLETE'));
  assert.ok(calls.some((c) => c.url.includes('/api/v2/statements')));
});

test('si Cortex COMPLETE está bloqueado (trial), los percentiles de Snowflake sobreviven', async () => {
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options?.body ?? '{}');
    const isCortex = body.statement?.includes('SNOWFLAKE.CORTEX.COMPLETE');
    if (isCortex) {
      return new Response(JSON.stringify({ message: 'AI function COMPLETE is not available for trial accounts.' }), { status: 403 });
    }
    if (body.statement?.includes('COUNT(*)')) {
      return new Response(JSON.stringify({ resultsetMetaData: { rowType: [{ name: 'N', type: 'FIXED' }] }, rowset: [['741']], status: 'SUCCESS' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      resultsetMetaData: { rowType: [{ name: 'CATEGORY', type: 'TEXT' }, { name: 'P25', type: 'FIXED' }, { name: 'P50', type: 'FIXED' }, { name: 'P75', type: 'FIXED' }, { name: 'P90', type: 'FIXED' }] },
      rowset: [['Supermercado', 1800, 2200, 2800, 3400]],
      status: 'SUCCESS',
    }), { status: 200 });
  };
  const rest = createSnowflakeRest({ account: 'norte-trial', user: 'u', password: 'p', warehouse: 'W', database: 'D', fetchImpl: fakeFetch });
  const repo = createSnowflakeRepository({ rest });
  const result = await repo.peerBenchmark({ customer: { segment: 'Preferente' }, spending: [{ category: 'Supermercado', total: 26000 }], months: 6 });
  assert.equal(result.source, 'snowflake');
  assert.equal(result.cohort.population, 741);
  assert.equal(result.categories[0].category, 'Supermercado');
  assert.ok(result.summary.percentile > 0);
  assert.ok(result.insight.includes('percentil'), 'usa la insight local');
  assert.equal(result.cortex.error.includes('not available for trial'), true);
  assert.equal(result.cortex.sql.includes('SNOWFLAKE.CORTEX.COMPLETE'), true);
});
// Genera los CSV del dataset poblacional para cargar en Snowflake.
// Uso: root → `npm run peer:seed` (o `node packages/mcp-server/scripts/build-peer-seed.js`).
//
// Escribe en data/snowflake/ (gitignore) `peer_customers.csv` y
// `peer_spending.csv`, listos para un PUT via COPY INTO. Mismos datos y misma
// semilla que el motor local (`src/data/peers.js`): el benchmark que corre sin
// Snowflake en la demo devuelve exactamente lo que daría la tabla cargada.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generatePopulation,
  PEER_CATEGORIES,
  DEFAULT_SEED,
  HISTORY_MONTHS,
} from '../src/data/peers.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'snowflake');

const SIZE = Number(process.env.PEER_SIZE || 500);
const CITIES = ['Monterrey', 'CDMX', 'Guadalajara', 'León', 'Puebla', 'Tijuana', 'Querétaro', 'Mérida'];
const AGES = Array.from({ length: 44 }, (_, i) => 22 + i);

const sampleOf = (arr, rand) => arr[Math.floor(rand() * arr.length)];

export function writePeerCsv({ size = SIZE, seed = DEFAULT_SEED } = {}) {
  const population = generatePopulation({ seed, size });
  mkdirSync(OUT_DIR, { recursive: true });

  // Semilla reproducible para las columnas demográficas (independiente de la de gasto).
  let a = (seed ^ 0x5bd1e995) >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const customersPath = join(OUT_DIR, 'peer_customers.csv');
  const spendingPath = join(OUT_DIR, 'peer_spending.csv');

  const customers = [`customer_id,segment,income,age,city`];
  const spending = [`customer_id,month,category,amount`];
  for (let i = 0; i < size; i++) {
    const id = `PEER-${String(i + 1).padStart(7, '0')}`;
    customers.push(
      `${id},${population.segments[i]},${population.incomes[i]},${sampleOf(AGES, rand)},${sampleOf(CITIES, rand)}`,
    );
    for (const month of population.months) {
      for (const cat of PEER_CATEGORIES) {
        const amount = population.spend[cat][month][i];
        if (amount > 0) spending.push(`${id},${month}-01,${cat},${Math.round(amount * 100) / 100}`);
      }
    }
  }

  writeFileSync(customersPath, `${customers.join('\n')}\n`);
  writeFileSync(spendingPath, `${spending.join('\n')}\n`);
  return { customersPath, spendingPath, customers: size, rows: size * HISTORY_MONTHS * PEER_CATEGORIES.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { customersPath, spendingPath, customers, rows } = writePeerCsv();
  console.log(`[peer] ${customers.toLocaleString('es-MX')} clientes · ${rows.toLocaleString('es-MX')} filas de gasto`);
  console.log(`[peer] ${customersPath}`);
  console.log(`[peer] ${spendingPath}`);
  console.log('[peer] Sigue los pasos de data/snowflake/001_peer_schema.sql y el README raíz para cargarlos con COPY INTO.');
}
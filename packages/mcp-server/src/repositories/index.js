// Selección de la fuente de datos bancarios.
// `memory` (seeds sintéticos) es la opción por defecto y el fallback de la demo;
// `tiger` (Postgres + TimescaleDB en Tiger Cloud) implementa el mismo contrato;
// `snowflake` es la capa analítica: delega lo operativo al repositorio local y
// alimenta los benchmarks de pares desde la SQL API + Cortex (o la población
// local si SNOWFLAKE_* no está configurado).

import { createMemoryRepository } from './memory.js';
import { createTigerRepository } from './tiger.js';
import { createSnowflakeRepository } from './snowflake.js';

const FACTORIES = {
  memory: createMemoryRepository,
  tiger: createTigerRepository,
  snowflake: createSnowflakeRepository,
};

export const DEFAULT_DATA_SOURCE = 'memory';

export function availableDataSources() {
  return Object.keys(FACTORIES);
}

export function createRepository({
  kind = process.env.BANK_DATA_SOURCE || DEFAULT_DATA_SOURCE,
  connectionString = process.env.DATABASE_URL,
  // El servidor MCP corre por stdio: cualquier aviso va a stderr, nunca a stdout.
  logger = console.error,
} = {}) {
  const factory = FACTORIES[kind];
  if (!factory) {
    throw new Error(`BANK_DATA_SOURCE desconocido: "${kind}". Opciones: ${availableDataSources().join(', ')}.`);
  }
  // Pedir `tiger` sin cadena de conexión es un despiste de configuración, no una
  // razón para tumbar la demo: se avisa y se sigue con los seeds en memoria.
  if (kind === 'tiger' && !connectionString) {
    logger('[norte] BANK_DATA_SOURCE=tiger pero falta DATABASE_URL; usando datos en memoria.');
    return createMemoryRepository();
  }
  // `snowflake` funciona igual sin credenciales: su camino analítico cae a la
  // población sintética local (mismos datos que data/snowflake/) y se avisa.
  if (kind === 'snowflake' && !process.env.SNOWFLAKE_ACCOUNT) {
    logger('[norte] BANK_DATA_SOURCE=snowflake sin SNOWFLAKE_ACCOUNT; benchmarks con población local.');
  }
  if (kind === 'snowflake') return factory();
  return kind === 'tiger' ? factory({ connectionString }) : factory();
}

// Selección de la fuente de datos bancarios.
// `memory` (seeds sintéticos) es la opción por defecto y el fallback de la demo;
// `tiger` (Postgres + TimescaleDB en Tiger Cloud) se registra aquí cuando exista.

import { createMemoryRepository } from './memory.js';

const FACTORIES = {
  memory: createMemoryRepository,
};

export const DEFAULT_DATA_SOURCE = 'memory';

export function availableDataSources() {
  return Object.keys(FACTORIES);
}

export function createRepository({ kind = process.env.BANK_DATA_SOURCE || DEFAULT_DATA_SOURCE } = {}) {
  const factory = FACTORIES[kind];
  if (!factory) {
    throw new Error(`BANK_DATA_SOURCE desconocido: "${kind}". Opciones: ${availableDataSources().join(', ')}.`);
  }
  return factory();
}

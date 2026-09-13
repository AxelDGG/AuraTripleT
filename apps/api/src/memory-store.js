// Memoria de largo plazo del agente.
//
// Es la tabla `customer_memory` de Tiger Data: hechos cortos y duraderos sobre
// la persona ("prefiere plazos de 12 meses", "Ana es su casera") que el agente
// aprende al cerrar cada turno (services/memory-extractor.js) y recupera al
// empezar el siguiente. La recuperación es semántica: cada hecho lleva su
// embedding (services/embeddings.js) y se buscan los más parecidos a la pregunta
// con pgvector (`<=>`, distancia coseno, índice HNSW). Sin embedder se recuperan
// los más recientes.
//
// Por qué hechos y no transcripciones: el orquestador tiene un presupuesto de
// tokens por minuto y cada memoria inyectada compite con el prompt y las tools.
// Cinco frases cortas personalizan; cinco conversaciones enteras lo saturan.
//
// Sin DATABASE_URL el store cae a memoria de proceso (mismo contrato, se pierde
// al reiniciar) para que la demo siga corriendo.

import pg from 'pg';
import { pgConnectionOptions } from '@norte/mcp-server/pg-options';
import { DEMO_CUSTOMER_ID } from './history-store.js';
import { cosineSimilarity, createEmbedder, toVectorLiteral } from './services/embeddings.js';
import { MEMORY_KINDS } from './services/memory-extractor.js';

const { Pool } = pg;

const DEFAULT_RECALL = 5;
const MAX_RECALL = 10;
const DEFAULT_LIST = 50;
const MAX_LIST = 200;
const MAX_CONTENT_CHARS = 200;
// Dos hechos con similitud coseno por encima de esto dicen lo mismo: no se duplica.
const DUPLICATE_SIMILARITY = 0.92;

const clamp = (value, fallback, max) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
};

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));

const mapMemory = (row) => ({
  id: row.id,
  kind: row.kind,
  content: row.content,
  createdAt: iso(row.created_at),
  lastUsedAt: iso(row.last_used_at),
  uses: row.uses ?? 0,
  ...(row.score !== undefined && row.score !== null ? { score: Math.round(Number(row.score) * 1000) / 1000 } : {}),
});

export function normalizeFact(fact) {
  const content = typeof fact?.content === 'string' ? fact.content.trim().replace(/\s+/g, ' ').slice(0, MAX_CONTENT_CHARS) : '';
  if (!content) return null;
  return { kind: MEMORY_KINDS.has(fact.kind) ? fact.kind : 'fact', content };
}

// Un embedding que falla no debe impedir guardar ni recuperar: se registra y se
// sigue sin vector (recencia / comparación textual).
async function safeEmbed(embedder, text, taskType, logger) {
  if (!embedder) return null;
  try {
    return await embedder.embed(text, { taskType });
  } catch (err) {
    logger(`[memoria] sin embedding (${err.message}); se sigue sin búsqueda semántica.`);
    return null;
  }
}

const toRow = (entry) => ({
  id: entry.id,
  kind: entry.kind,
  content: entry.content,
  created_at: entry.createdAt,
  last_used_at: entry.lastUsedAt,
  uses: entry.uses,
});

// Store en memoria de proceso: mismo contrato, sin persistencia.
export function createInMemoryMemoryStore({ embedder = null, logger = console.warn } = {}) {
  let entries = [];
  let nextId = 1;

  const ofCustomer = (customerId) => entries.filter((e) => e.customerId === customerId);

  return {
    kind: 'memory',
    semantic: Boolean(embedder),

    async recall({ customerId = DEMO_CUSTOMER_ID, query, limit } = {}) {
      const n = clamp(limit, DEFAULT_RECALL, MAX_RECALL);
      const mine = ofCustomer(customerId);
      if (!mine.length) return [];
      const vector = query ? await safeEmbed(embedder, query, 'RETRIEVAL_QUERY', logger) : null;
      let picked;
      if (vector) {
        picked = mine
          .map((entry) => ({ entry, score: entry.embedding ? cosineSimilarity(vector, entry.embedding) : 0 }))
          .sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt))
          .slice(0, n);
      } else {
        picked = [...mine]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, n)
          .map((entry) => ({ entry, score: null }));
      }
      const usedAt = new Date().toISOString();
      for (const { entry } of picked) {
        entry.uses += 1;
        entry.lastUsedAt = usedAt;
      }
      return picked.map(({ entry, score }) => mapMemory({ ...toRow(entry), score }));
    },

    async remember({ customerId = DEMO_CUSTOMER_ID, facts = [] } = {}) {
      const saved = [];
      for (const raw of facts) {
        const fact = normalizeFact(raw);
        if (!fact) continue;
        const vector = await safeEmbed(embedder, fact.content, 'RETRIEVAL_DOCUMENT', logger);
        const duplicate = ofCustomer(customerId).some(
          (e) =>
            e.content.toLowerCase() === fact.content.toLowerCase() ||
            (vector && e.embedding && cosineSimilarity(vector, e.embedding) >= DUPLICATE_SIMILARITY),
        );
        if (duplicate) continue;
        const entry = {
          id: `mem-${nextId++}`,
          customerId,
          kind: fact.kind,
          content: fact.content,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          uses: 0,
          embedding: vector,
        };
        entries = [...entries, entry];
        saved.push(mapMemory(toRow(entry)));
      }
      return saved;
    },

    async list({ customerId = DEMO_CUSTOMER_ID, limit } = {}) {
      return ofCustomer(customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, clamp(limit, DEFAULT_LIST, MAX_LIST))
        .map((e) => mapMemory(toRow(e)));
    },

    async forget({ customerId = DEMO_CUSTOMER_ID, id } = {}) {
      const before = entries.length;
      entries = entries.filter((e) => !(e.customerId === customerId && e.id === id));
      return entries.length < before;
    },

    async close() {},
  };
}

function createTigerMemoryStore({ connectionString, pool, embedder, logger }) {
  const db =
    pool ??
    new Pool(
      pgConnectionOptions(connectionString, {
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    );

  const COLUMNS = 'id, kind, content, created_at, last_used_at, uses';

  return {
    kind: 'tiger',
    semantic: Boolean(embedder),

    // Los hechos más parecidos a la pregunta. `embedding <=> $2` es la
    // distancia coseno de pgvector; el ORDER BY sobre ella usa el índice HNSW.
    async recall({ customerId = DEMO_CUSTOMER_ID, query, limit } = {}) {
      const n = clamp(limit, DEFAULT_RECALL, MAX_RECALL);
      const vector = query ? await safeEmbed(embedder, query, 'RETRIEVAL_QUERY', logger) : null;
      const { rows } = vector
        ? await db.query(
            `SELECT ${COLUMNS}, 1 - (embedding <=> $2::vector) AS score
               FROM customer_memory
              WHERE customer_id = $1 AND embedding IS NOT NULL
              ORDER BY embedding <=> $2::vector, created_at DESC
              LIMIT $3`,
            [customerId, toVectorLiteral(vector), n],
          )
        : await db.query(
            `SELECT ${COLUMNS}
               FROM customer_memory
              WHERE customer_id = $1
              ORDER BY created_at DESC
              LIMIT $2`,
            [customerId, n],
          );
      if (rows.length) {
        await db.query('UPDATE customer_memory SET last_used_at = now(), uses = uses + 1 WHERE id = ANY($1::uuid[])', [
          rows.map((r) => r.id),
        ]);
      }
      return rows.map(mapMemory);
    },

    // Guarda los hechos nuevos; uno igual (texto) o casi igual (similitud
    // coseno ≥ 0.92) al de una memoria existente se descarta.
    async remember({ customerId = DEMO_CUSTOMER_ID, facts = [] } = {}) {
      const saved = [];
      for (const raw of facts) {
        const fact = normalizeFact(raw);
        if (!fact) continue;
        const vector = await safeEmbed(embedder, fact.content, 'RETRIEVAL_DOCUMENT', logger);
        const literal = vector ? toVectorLiteral(vector) : null;
        const duplicate = await db.query(
          `SELECT id
             FROM customer_memory
            WHERE customer_id = $1
              AND (lower(content) = lower($2)
                   OR ($3::vector IS NOT NULL AND embedding IS NOT NULL AND 1 - (embedding <=> $3::vector) >= $4))
            LIMIT 1`,
          [customerId, fact.content, literal, DUPLICATE_SIMILARITY],
        );
        if (duplicate.rowCount) continue;
        const { rows } = await db.query(
          `INSERT INTO customer_memory (customer_id, kind, content, embedding)
           VALUES ($1, $2, $3, $4::vector)
           RETURNING ${COLUMNS}`,
          [customerId, fact.kind, fact.content, literal],
        );
        saved.push(mapMemory(rows[0]));
      }
      return saved;
    },

    async list({ customerId = DEMO_CUSTOMER_ID, limit } = {}) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM customer_memory WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [customerId, clamp(limit, DEFAULT_LIST, MAX_LIST)],
      );
      return rows.map(mapMemory);
    },

    async forget({ customerId = DEMO_CUSTOMER_ID, id } = {}) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ''))) return false;
      const result = await db.query('DELETE FROM customer_memory WHERE customer_id = $1 AND id = $2', [customerId, id]);
      return result.rowCount > 0;
    },

    async close() {
      if (!pool) await db.end();
    },
  };
}

export function createMemoryStore({
  connectionString = process.env.DATABASE_URL,
  pool,
  embedder = createEmbedder(),
  logger = console.warn,
} = {}) {
  if (!embedder) logger('[memoria] Sin GEMINI_API_KEY: la memoria se recupera por recencia, no por significado.');
  if (!pool && !connectionString) {
    logger('[norte] Sin DATABASE_URL: la memoria del agente vive en memoria y se pierde al reiniciar.');
    return createInMemoryMemoryStore({ embedder, logger });
  }
  return createTigerMemoryStore({ connectionString, pool, embedder, logger });
}

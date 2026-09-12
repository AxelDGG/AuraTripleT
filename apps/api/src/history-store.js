// Historial de visualizaciones generadas por el agente.
//
// Es la hypertable `ui_history` de Tiger Data: una fila por interfaz generada,
// con la carpeta que eligió la IA, el título, el prompt que la originó y el
// Norte UI Spec completo en JSONB. Alimenta el carrusel central y las carpetas
// del panel derecho de la web.
//
// Sin DATABASE_URL el store cae a memoria para que la demo siga corriendo; en
// ese modo el historial se pierde al reiniciar la API (y así lo reporta `kind`).

import pg from 'pg';
import { pgConnectionOptions } from '@norte/mcp-server/pg-options';
import { DEFAULT_FOLDER, FOLDER_IDS, normalizeFolder } from '@norte/a2ui-schema';

const { Pool } = pg;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
export const DEMO_CUSTOMER_ID = process.env.DEMO_CUSTOMER_ID || 'CLT-889201';

// `title` es NOT NULL en la hypertable y es lo que se busca desde el panel: si
// el agente no mandó uno utilizable, se guarda un texto neutro en vez de fallar.
const safeTitle = (title) => {
  const text = typeof title === 'string' ? title.trim() : '';
  return text || 'Visualización';
};

const clampLimit = (limit) => {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
};

const mapEntry = (row) => ({
  id: row.id,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  folder: row.folder,
  title: row.title,
  prompt: row.prompt ?? null,
  message: row.message ?? null,
  spec: row.spec,
});

// Store en memoria: mismo contrato, sin persistencia. Es el fallback de la demo.
function createMemoryHistoryStore() {
  let entries = [];
  let nextId = 1;

  const matches = (entry, { folder, search }) => {
    if (folder && entry.folder !== folder) return false;
    if (search && !entry.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  };

  return {
    kind: 'memory',
    async add({ folder, title, prompt, message, spec }) {
      const entry = {
        id: `mem-${nextId++}`,
        createdAt: new Date().toISOString(),
        folder: normalizeFolder(folder),
        title: safeTitle(title),
        prompt: prompt ?? null,
        message: message ?? null,
        spec,
      };
      entries = [entry, ...entries];
      return entry;
    },
    async list({ folder, search, limit } = {}) {
      return entries.filter((e) => matches(e, { folder, search })).slice(0, clampLimit(limit));
    },
    async counts() {
      const totals = Object.fromEntries(FOLDER_IDS.map((id) => [id, 0]));
      for (const entry of entries) totals[entry.folder] = (totals[entry.folder] ?? 0) + 1;
      return totals;
    },
    async close() {},
  };
}

function createTigerHistoryStore({ connectionString, pool }) {
  const db =
    pool ??
    new Pool(
      pgConnectionOptions(connectionString, {
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    );

  return {
    kind: 'tiger',

    async add({ folder, title, prompt, message, spec, customerId = DEMO_CUSTOMER_ID }) {
      const { rows } = await db.query(
        `INSERT INTO ui_history (customer_id, folder, title, prompt, message, spec)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at, folder, title, prompt, message, spec`,
        [customerId, normalizeFolder(folder), safeTitle(title), prompt ?? null, message ?? null, JSON.stringify(spec)],
      );
      return mapEntry(rows[0]);
    },

    // El orden por created_at DESC lo resuelve el índice (folder, created_at DESC)
    // de la hypertable; la búsqueda por título usa el índice trigram.
    async list({ folder, search, limit } = {}) {
      const where = [];
      const values = [];
      if (folder) {
        values.push(normalizeFolder(folder));
        where.push(`folder = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        where.push(`title ILIKE $${values.length}`);
      }
      values.push(clampLimit(limit));

      const { rows } = await db.query(
        `SELECT id, created_at, folder, title, prompt, message, spec
           FROM ui_history
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY created_at DESC
          LIMIT $${values.length}`,
        values,
      );
      return rows.map(mapEntry);
    },

    // Contadores por carpeta para las tarjetas del panel derecho. Se devuelven
    // las cinco carpetas siempre, incluso las que están en cero.
    async counts() {
      const { rows } = await db.query('SELECT folder, count(*)::int AS total FROM ui_history GROUP BY folder');
      const totals = Object.fromEntries(FOLDER_IDS.map((id) => [id, 0]));
      for (const row of rows) {
        if (row.folder in totals) totals[row.folder] = row.total;
        else totals[DEFAULT_FOLDER] += row.total;
      }
      return totals;
    },

    async close() {
      if (!pool) await db.end();
    },
  };
}

export function createHistoryStore({
  connectionString = process.env.DATABASE_URL,
  pool,
  logger = console.warn,
} = {}) {
  if (!pool && !connectionString) {
    logger('[norte] Sin DATABASE_URL: el historial de visualizaciones vive en memoria y se pierde al reiniciar.');
    return createMemoryHistoryStore();
  }
  return createTigerHistoryStore({ connectionString, pool });
}

export { createMemoryHistoryStore };

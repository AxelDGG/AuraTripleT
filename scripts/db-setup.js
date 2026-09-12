// Aplica el esquema y el seed de Tiger Data contra DATABASE_URL.
//
//   npm run db:setup            # esquema + seed
//   npm run db:setup -- --schema-only
//
// Sirve igual para Tiger Cloud y para el TimescaleDB del docker compose: la
// única diferencia es la cadena de conexión. Todo el SQL es idempotente, así que
// volver a correrlo sobre una base ya poblada no rompe nada.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import pg from 'pg';
import { pgConnectionOptions } from '@norte/mcp-server/pg-options';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = resolve(ROOT, 'data/seeds/001_schema.sql');
const SEED = resolve(ROOT, 'data/seeds/002_seed.sql');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Cópiala del servicio en Tiger Cloud (o usa la de docker compose) y ponla en .env.');
  process.exit(1);
}

const schemaOnly = process.argv.includes('--schema-only');

const client = new pg.Client(pgConnectionOptions(connectionString));

// Oculta la contraseña al imprimir a dónde nos conectamos.
const safeTarget = connectionString.replace(/\/\/([^:]+):[^@]*@/, '//$1:***@');

// Los archivos .sql se ejecutan sentencia por sentencia: mandar el archivo entero
// en una sola query lo envolvería en una transacción implícita, y
// CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous) no admite correr
// dentro de una transacción. El separador respeta comillas simples, comentarios
// de línea y bloques $$…$$ para no cortar un literal a la mitad.
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let inLineComment = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      current += ch;
      continue;
    }
    if (dollarTag) {
      current += ch;
      if (sql.startsWith(dollarTag, i)) {
        current += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (inString) {
      current += ch;
      // '' dentro de un literal es una comilla escapada, no el cierre.
      if (ch === "'") {
        if (next === "'") { current += next; i++; } else { inString = false; }
      }
      continue;
    }
    if (ch === '-' && next === '-') { inLineComment = true; current += ch; continue; }
    if (ch === "'") { inString = true; current += ch; continue; }
    const dollar = ch === '$' && sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (dollar) {
      dollarTag = dollar[0];
      current += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }
    if (ch === ';') { statements.push(current); current = ''; continue; }
    current += ch;
  }
  statements.push(current);

  // Descarta los trozos que solo traen comentarios o espacios.
  return statements.filter((s) => s.replace(/--[^\n]*/g, '').trim().length > 0);
}

async function runFile(path, label) {
  console.log(`Aplicando ${label}…`);
  for (const statement of splitStatements(readFileSync(path, 'utf8'))) {
    await client.query(statement);
  }
}

try {
  await client.connect();
  console.log(`Conectado a ${safeTarget}`);

  const version = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'").catch(() => null);
  await runFile(SCHEMA, 'data/seeds/001_schema.sql');

  if (!schemaOnly) {
    await runFile(SEED, 'data/seeds/002_seed.sql');
    // El agregado continuo se crea WITH NO DATA: hay que materializarlo una vez
    // tras cargar el seed para que la primera consulta ya tenga resultados.
    console.log('Materializando spending_by_category_monthly…');
    await client.query("CALL refresh_continuous_aggregate('spending_by_category_monthly', NULL, NULL)");
  }

  const counts = await client.query(`
    SELECT 'accounts' AS tabla, count(*) AS filas FROM accounts
    UNION ALL SELECT 'transactions', count(*) FROM transactions
    UNION ALL SELECT 'beneficiaries', count(*) FROM beneficiaries
    UNION ALL SELECT 'ui_history', count(*) FROM ui_history
    ORDER BY tabla`);

  console.log(`\nTimescaleDB ${version?.rows[0]?.extversion ?? '(versión desconocida)'}`);
  for (const row of counts.rows) console.log(`  ${row.tabla.padEnd(15)} ${row.filas}`);
  console.log('\nListo. Pon BANK_DATA_SOURCE=tiger en .env para que la app lea de aquí.');
} catch (err) {
  console.error(`\nFalló la carga: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

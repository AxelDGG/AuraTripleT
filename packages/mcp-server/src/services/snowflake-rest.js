// Cliente mínimo de la SQL REST API de Snowflake (sin dependencias: `fetch`).
// Es el mismo endpoint que muestra el ejemplo del reto: un POST a
// `POST /api/v2/statements` con una consulta y polling del handle.
//
// Autenticación: los trials actuales ya no aceptan usuario/contraseña en la SQL
// API (exigen Bearer), así que usamos key-pair auth: un JWT RS256 firmado con
// una llave privada propia, cuyo public key se registra en el usuario
// (ALTER USER ... SET RSA_PUBLIC_KEY). Si SNOWFLAKE_PRIVATE_KEY_PATH es una
// "frase" (formato no-pem como 'prueba'/'no key'), se manda como Bearer directo
// para la demo; si no, se firma el JWT con la llave. Sigue funcionando el
// Basic simple para cuentas viejas (sin SNOWFLAKE_PRIVATE_KEY_PATH).
//
// Se usa para los benchmarks de pares (percentiles por ventana SQL) y para las
// funciones Cortex (`SNOWFLAKE.CORTEX.COMPLETE`), que corren como una llamada
// más de la SQL API. Si SNOWFLAKE_* no está configurado, `configured` es false
// y el repositorio cae a la población sintética local.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 60;
const REQUEST_TIMEOUT_MS = 90000;

const base64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

function expandPath(path) {
  if (!path) return null;
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function loadPrivateKey(path) {
  const full = expandPath(path);
  if (!full) return null;
  try {
    return { pem: readFileSync(full, 'utf8'), path: full };
  } catch {
    return null;
  }
}

// JWT RS256 para key-pair auth (el método obligatorio en los trials nuevos).
// iss debe ser "<account_identifier>.<login_name>" (identificador sin dominio).
function signJwt(account, login, privateKeyPem) {
  const accountId = account.replace(/\.snowflakecomputing\.com$/, '');
  const subject = `${accountId}.${login}`;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: subject, sub: subject, iat: now, exp: now + 3240 }),
  );
  const input = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256')
    .update(input)
    .sign(privateKeyPem);
  return `${input}.${base64url(signature)}`;
}

// La key puede venir como archivo (SNOWFLAKE_PRIVATE_KEY_PATH) o como contenido
// PEM embebido (SNOWFLAKE_PRIVATE_KEY). En la demo sin certificado se admite una
// "frase" simple para enseñar el formato Bearer.
function resolveBearer({ account, login, keyPath, keyPem }) {
  const loaded = loadPrivateKey(keyPath) || (keyPem ? { pem: keyPem, path: '(env)' } : null);
  if (loaded?.pem?.includes('PRIVATE KEY')) {
    return () => `Bearer ${signJwt(account, login, loaded.pem)}`;
  }
  const rawKey = keyPath;
  if (rawKey && !rawKey.includes('/') && !rawKey.includes('\\')) {
    return () => `Bearer ${rawKey}`;
  }
  return null;
}

function baseUrl(account) {
  if (!account) return null;
  if (account.includes('snowflakecomputing.com')) return `https://${account}`;
  return `https://${account}.snowflakecomputing.com`;
}

// Convierte una fila cruda de la SQL API a un objeto con los tipos correctos.
// La API devuelve el tipo en minúsculas ('fixed') o mayúsculas ('FIXED').
function mapRow(row, columns) {
  const out = {};
  columns.forEach((col, index) => {
    let value = row[index];
    const type = String(col.type || '').toUpperCase();
    if (type === 'FIXED' || type === 'REAL') value = value === null ? null : Number(value);
    else if (type === 'BOOLEAN') value = value === null ? null : String(value).toLowerCase() === 'true';
    out[col.name.toLowerCase()] = value;
  });
  return out;
}

// Normaliza una respuesta de la SQL API (POST o GET del handle): la API usa
// resultSetMetaData/data y a veces resultsetMetaData/rowset según el endpoint,
// y puede o no incluir el campo `status` (si viene `code: 090001` es éxito).
function parseStatementResponse(payload) {
  const meta = payload?.resultSetMetaData ?? payload?.resultsetMetaData ?? null;
  const status =
    payload?.status ??
    (payload?.code === '090001' ? 'SUCCESS' : payload?.code === '090003' || payload?.code === '333334' ? 'RUNNING' : null);
  const err = payload?.error;
  return {
    meta,
    data: payload?.data ?? payload?.rowset ?? null,
    status,
    handle: payload?.statementHandle ?? null,
    error: (typeof err === 'string' ? err : err?.message) ?? null,
  };
}

export function createSnowflakeRest({
  account = process.env.SNOWFLAKE_ACCOUNT,
  user = process.env.SNOWFLAKE_USER,
  password = process.env.SNOWFLAKE_PASSWORD,
  privateKeyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
  privateKey = process.env.SNOWFLAKE_PRIVATE_KEY,
  warehouse = process.env.SNOWFLAKE_WAREHOUSE,
  database = process.env.SNOWFLAKE_DATABASE,
  schema = process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
  role,
  fetchImpl = fetch,
  logger = console.error,
} = {}) {
  const host = baseUrl(account);
  const pat = process.env.SNOWFLAKE_ACCESS_TOKEN || process.env.SNOWFLAKE_PROGRAMMATIC_ACCESS_TOKEN;
  const getAuth =
    (pat && (() => `Bearer ${pat}`)) ||
    resolveBearer({ account, login: user, keyPath: privateKeyPath, keyPem: privateKey });
  const configured = Boolean(host && user && (getAuth || password));

  async function authHeaders(extra = {}) {
    return {
      ...(getAuth
        ? { Authorization: getAuth() }
        : { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`, 'X-Snowflake-Authorization-Token-Type': 'BASIC' }),
      ...extra,
    };
  }

  async function postStatement(statement, { database: db = database, schema: sc = schema } = {}) {
    const url = `${host}/api/v2/statements`;
    const body = {
      statement,
      timeout: 180,
      database: db,
      schema: sc,
      ...(warehouse ? { warehouse } : {}),
      ...(role ? { role } : {}),
      parameters: { MULTI_STATEMENT_COUNT: '0' },
    };
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: await authHeaders({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'norte-ai/1.0 (hackathon banorte)',
      }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = payload?.message || payload?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Snowflake SQL API: ${message}`);
    }
    return payload;
  }

  // Ejecuta una consulta y devuelve { columns: string[], rows: object[], sql }.
  // Las consultas sincrónicas llegan completas en el POST; las asíncronas
  // (resultados grandes) se traen por streaming con rowsetSize=0.
  async function execute(statement) {
    const payload = await postStatement(statement);
    let res = parseStatementResponse(payload);
    if (res.status !== 'SUCCESS' && res.status !== 'FAILED' && res.handle) {
      // La consulta quedó corriendo (statementHandle): hacemos polling del GET.
      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        const pollRes = await fetchImpl(`${host}/api/v2/statements/${res.handle}?rowsetSize=0`, {
          headers: await authHeaders({ 'Accept': 'application/json' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const pollPayload = await pollRes.json().catch(() => null);
        const state = parseStatementResponse(pollPayload);
        if (state.status === 'SUCCESS' || state.status === 'FAILED' || state.status === 'CANCELED') {
          res = state;
          break;
        }
        if (state.handle) res.handle = state.handle;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }
    if (res.status === 'FAILED' || res.status === 'CANCELED') {
      throw new Error(`Snowflake SQL API: la consulta terminó en ${res.status}: ${res.error || ''}`.trim());
    }
    if (res.status !== 'SUCCESS') {
      throw new Error('Snowflake SQL API: la consulta tardó demasiado.');
    }
    const columns = (res.meta?.rowType ?? []).map((c) => c.name);
    const rows = (res.data ?? []).map((row) => mapRow(row, res.meta?.rowType ?? []));
    return { columns, rows, sql: statement };
  }

  return {
    configured,
    host,
    baseUrl: host,
    execute,
    // Diagnóstico corto para el README y la UI ("fuente: Snowflake + Cortex").
    provenance: configured ? { engine: 'snowflake-sql-api', cortex: 'SNOWFLAKE.CORTEX.COMPLETE' } : null,
  };
}
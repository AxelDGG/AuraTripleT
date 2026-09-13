// Tokens de sesión: JSON firmado con HMAC-SHA256, sin dependencias.
//
// Es un JWT en espíritu (payload base64url + firma) pero sin arrastrar una
// librería por tres funciones. El token es opaco para el cliente: la app móvil
// lo guarda en el llavero del sistema (expo-secure-store) y lo manda como
// `Authorization: Bearer <token>`.
//
// Tradeoff registrado: sesión sin estado en el servidor. No hay "cerrar sesión
// en todos los dispositivos" — el logout borra el token del dispositivo y ya.
// Para la demo sobra; si hiciera falta revocar, se agrega una lista de jti.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const DEFAULT_TTL_HOURS = 12;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (text) => Buffer.from(text, 'base64url');

let cachedSecret = null;

// En producción `AUTH_SECRET` es obligatoria. Sin ella se genera una por
// proceso: la demo local sigue funcionando y los tokens simplemente dejan de
// ser válidos al reiniciar la API.
export function getSecret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET es obligatoria en producción (mínimo 16 caracteres).');
  }
  console.warn('[auth] Sin AUTH_SECRET: se genera una llave efímera; las sesiones mueren al reiniciar la API.');
  cachedSecret = randomBytes(32).toString('hex');
  return cachedSecret;
}

const sign = (payload) => createHmac('sha256', getSecret()).update(payload).digest();

export function issueToken(claims, { ttlHours = Number(process.env.AUTH_TOKEN_TTL_HOURS) || DEFAULT_TTL_HOURS } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...claims, iat: now, exp: now + Math.round(ttlHours * 3600) };
  const payload = b64url(JSON.stringify(body));
  return { token: `${payload}.${b64url(sign(payload))}`, expiresAt: new Date(body.exp * 1000).toISOString() };
}

// Devuelve los claims o null. Nunca lanza: un token corrupto es un 401, no un 500.
export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const received = fromB64url(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8'));
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

// Solo para pruebas: olvida la llave cacheada tras cambiar AUTH_SECRET.
export function resetSecretCache() {
  cachedSecret = null;
}

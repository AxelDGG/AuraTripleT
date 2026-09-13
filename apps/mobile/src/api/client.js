// Cliente HTTP de la app.
//
// Tres cosas que no queremos repetir en cada pantalla: el token de sesión, el
// timeout y el mensaje de error legible. Cuando la API responde 401 se avisa
// una sola vez al AuthProvider, que manda a la persona de vuelta al login.

import { apiUrl } from '../lib/config';

const DEFAULT_TIMEOUT_MS = 15000;

let tokenProvider = () => null;
let onUnauthorized = () => {};

export function configureClient({ getToken, onUnauthorized: handler }) {
  if (getToken) tokenProvider = getToken;
  if (handler) onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function authHeaders(extra = {}) {
  const token = tokenProvider();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

export async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal, auth = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener?.('abort', () => controller.abort());

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  Object.assign(headers, auth ? authHeaders() : {});

  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 401 && auth) onUnauthorized();
    if (!res.ok || payload.ok === false) {
      throw new ApiError(payload.error || `HTTP ${res.status}`, res.status);
    }
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError('La conexión tardó demasiado. Revisa tu red.', 0);
    // Error de red: el caso más común en la demo es que la URL de la API esté mal.
    throw new ApiError('No se pudo conectar con Banorte. Revisa la conexión en Servicios.', 0);
  } finally {
    clearTimeout(timer);
  }
}

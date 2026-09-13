// Cliente OAuth2 de Google, compartido por las tools de Calendar.
// El token (con refresh_token) se genera una vez con `npm run google:auth`
// y se persiste en disco; aquí solo se carga y se mantiene actualizado.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Por defecto, junto a los seeds bancarios en la raíz del repo (data/), sin
// importar desde qué carpeta se ejecute el server o el script de autorización.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || join(REPO_ROOT, 'data', 'google-token.json');

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el .env.');
  }
  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost:3045/oauth2callback',
  );
  // googleapis refresca el access_token solo; aquí lo volvemos a guardar cuando cambia.
  client.on('tokens', (tokens) => {
    const current = readToken() ?? {};
    saveToken({ ...current, ...tokens });
  });
  return client;
}

export function readToken() {
  if (!existsSync(TOKEN_PATH)) return null;
  return JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
}

export function saveToken(tokens) {
  mkdirSync(dirname(TOKEN_PATH), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

// Cliente listo para llamar a la API (o null si falta config/autorización).
export function getAuthorizedClient() {
  if (!isGoogleConfigured()) return null;
  const token = readToken();
  if (!token) return null;
  const client = createOAuthClient();
  client.setCredentials(token);
  return client;
}

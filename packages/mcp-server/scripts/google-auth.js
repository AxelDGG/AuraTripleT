// Autorización interactiva de Google Calendar (correr una sola vez):
//   npm run google:auth
// Abre el consentimiento de Google, recibe el code en un servidor local
// (mismo puerto que GOOGLE_REDIRECT_URI) y guarda el token con refresh_token.

import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createOAuthClient, saveToken, GOOGLE_CALENDAR_SCOPES } from '../src/google/auth.js';

// El .env vive en la raíz del repo, sin importar desde qué carpeta se corra el script.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3045/oauth2callback';
const { port, pathname } = new URL(redirectUri);

const client = createOAuthClient();
const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // fuerza refresh_token incluso si ya se autorizó antes
  scope: GOOGLE_CALENDAR_SCOPES,
});

console.log('\nAbre esta URL y acepta el acceso a tu Google Calendar:\n');
console.log(authUrl, '\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== pathname) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Autorización rechazada</h1><p>${error}</p>`);
    console.error(`[google-auth] Autorización rechazada: ${error}`);
    server.close(() => process.exit(1));
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    saveToken(tokens);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Listo</h1><p>Google Calendar autorizado. Puedes cerrar esta pestaña.</p>');
    console.log('[google-auth] Token guardado en', process.env.GOOGLE_TOKEN_PATH || 'data/google-token.json');
    server.close(() => process.exit(0));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Error</h1><p>No se pudo canjear el code por un token.</p>');
    console.error('[google-auth] Error al obtener el token:', err.message);
    server.close(() => process.exit(1));
  }
});

server.listen(Number(port) || 3045, () => {
  console.log(`Esperando el callback en ${redirectUri} ...`);
});

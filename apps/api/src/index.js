// Arranque del servidor HTTP de Norte AI: carga el .env de la raíz del
// monorepo, ensambla la app (app.js) y precalienta la conexión MCP.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { getMcpClient } from './mcp-client.js';
import { getSecret } from './auth/tokens.js';

// El .env vive en la raíz del repo, sin importar desde qué carpeta se ejecute.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const PORT = process.env.PORT || 3040;

process.on('unhandledRejection', (reason) => {
  console.error('[process] promesa rechazada sin manejar:', reason);
});

// La llave de sesión se resuelve ANTES de escuchar.
//
// Sin `AUTH_SECRET` en producción, `getSecret()` lanza — pero dentro del
// handler de login, que es `async`. Express 4 no atrapa un throw asíncrono, así
// que la promesa quedaba rechazada sin manejar y la respuesta nunca salía: la
// API arrancaba sana, `/api/health` respondía 200, el login con contraseña
// equivocada devolvía 401 correctamente, y solo el login CORRECTO se colgaba
// para siempre. Un servidor así parece bueno y no lo está.
//
// Resolverla aquí convierte esa configuración incompleta en un arranque que no
// ocurre, que es justo lo que el healthcheck del deploy sabe detectar.
getSecret();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Norte AI API corriendo en http://localhost:${PORT}`);
  // Precalentar la conexión MCP para que la primera consulta sea rápida.
  getMcpClient()
    .then(() => console.log('[MCP] conexión establecida'))
    .catch((err) => console.error('[MCP] error al conectar:', err.message));
});

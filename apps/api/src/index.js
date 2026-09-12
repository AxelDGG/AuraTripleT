// Arranque del servidor HTTP de Norte AI: carga el .env de la raíz del
// monorepo, ensambla la app (app.js) y precalienta la conexión MCP.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { getMcpClient } from './mcp-client.js';

// El .env vive en la raíz del repo, sin importar desde qué carpeta se ejecute.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const PORT = process.env.PORT || 3040;

process.on('unhandledRejection', (reason) => {
  console.error('[process] promesa rechazada sin manejar:', reason);
});

const app = createApp();

app.listen(PORT, () => {
  console.log(`Norte AI API corriendo en http://localhost:${PORT}`);
  // Precalentar la conexión MCP para que la primera consulta sea rápida.
  getMcpClient()
    .then(() => console.log('[MCP] conexión establecida'))
    .catch((err) => console.error('[MCP] error al conectar:', err.message));
});

// Punto de entrada del paquete @norte/mcp-server.
// Expone la ruta absoluta del servidor MCP (stdio) para que un cliente
// lo lance como subproceso sin depender de la estructura de carpetas.
import { fileURLToPath } from 'node:url';

export const SERVER_PATH = fileURLToPath(new URL('./server.js', import.meta.url));

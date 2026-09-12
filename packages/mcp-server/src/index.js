// Punto de entrada del paquete @norte/mcp-server.
// Expone la ruta absoluta del servidor MCP (stdio) para que un cliente
// lo lance como subproceso sin depender de la estructura de carpetas.
import { fileURLToPath } from 'node:url';

export const SERVER_PATH = fileURLToPath(new URL('./server.js', import.meta.url));

// Reglas de negocio y fuentes de datos, por si otro paquete quiere usarlas sin MCP.
export { createBankingTools, MAX_TRANSFER_AMOUNT } from './tools.js';
export { createRepository, availableDataSources } from './repositories/index.js';
export { createMemoryRepository } from './repositories/memory.js';

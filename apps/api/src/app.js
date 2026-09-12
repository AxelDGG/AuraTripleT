// Ensambla la app Express: middleware de seguridad, estáticos de @norte/web,
// rate limiting y rutas. `createApp` no escucha en ningún puerto para poder
// probarla y para que index.js decida cómo arrancarla.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { runAgent } from './agent.js';
import { corsForClients, securityHeaders } from './middleware/security.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { dashboardRouter } from './routes/dashboard.js';
import { creditRouter } from './routes/credit.js';
import { createChatRouter } from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WEB_PUBLIC_DIR = path.join(__dirname, '..', '..', 'web', 'public');

const JSON_BODY_LIMIT = '1mb';
// El agente (LLM) es el recurso caro: 20/min. El resto de la API: 120/min.
const CHAT_REQUESTS_PER_MINUTE = 20;
const API_REQUESTS_PER_MINUTE = 120;

export function createApp({ agent = runAgent, staticDir = WEB_PUBLIC_DIR } = {}) {
  const app = express();

  app.use(corsForClients);
  app.use(securityHeaders);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(staticDir));

  app.use('/api/chat', createRateLimiter(CHAT_REQUESTS_PER_MINUTE));
  app.use('/api', createRateLimiter(API_REQUESTS_PER_MINUTE));

  app.use(healthRouter);
  app.use(dashboardRouter);
  app.use(creditRouter);
  app.use(createChatRouter({ runAgent: agent }));

  app.use(errorHandler);
  return app;
}

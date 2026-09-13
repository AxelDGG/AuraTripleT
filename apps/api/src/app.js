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
import { customerRouter } from './routes/customer.js';
import { overviewRouter } from './routes/overview.js';
import { creditRouter } from './routes/credit.js';
import { createChatRouter } from './routes/chat.js';
import { authRouter } from './routes/auth.js';
import { voiceRouter } from './routes/voice.js';
import { createHistoryRouter } from './routes/history.js';
import { a2uiRouter } from './routes/a2ui.js';
import { createHistoryStore } from './history-store.js';
import { attachSession, enforceAuthIfConfigured } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WEB_PUBLIC_DIR = path.join(__dirname, '..', '..', 'web', 'public');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
// Núcleo de Norte A2UI (sin dependencias): la web lo importa como módulos ES
// desde /a2ui/*.js, así el runtime es el mismo archivo que usa la API.
export const A2UI_CORE_DIR = path.join(__dirname, '..', '..', '..', 'packages', 'a2ui-schema', 'src', 'core');

// Páginas de la web. La banca en línea entra por la portada, el agente vive en
// su propia ruta y el login es una pantalla aparte; los tres son archivos
// estáticos, pero con URL limpia y sin depender del `index.html` implícito.
const PAGES = {
  '/': 'inicio.html',
  '/inicio': 'inicio.html',
  '/login': 'login.html',
  '/asistente': 'index.html',
};

const JSON_BODY_LIMIT = '1mb';
// El agente (LLM) es el recurso caro: 20/min. El resto de la API: 120/min.
const CHAT_REQUESTS_PER_MINUTE = 20;
const API_REQUESTS_PER_MINUTE = 120;
// El login es el endpoint que invita a probar contraseñas: se limita aparte y mucho más fuerte.
const LOGIN_REQUESTS_PER_MINUTE = 10;

export function createApp({ agent = runAgent, staticDir = WEB_PUBLIC_DIR, historyStore = createHistoryStore() } = {}) {
  const app = express();

  app.use(corsForClients);
  app.use(securityHeaders);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Antes que los estáticos: si no, express.static respondería `/` con
  // index.html (el agente) en lugar de la portada.
  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (_req, res) => res.sendFile(path.join(staticDir, file)));
  }
  app.use(express.static(staticDir));
  // Fondo y cabecera compartidos con la app móvil.
  app.use('/assets', express.static(ASSETS_DIR));
  app.use('/a2ui', express.static(A2UI_CORE_DIR, { extensions: ['js'] }));

  app.use('/api/auth/login', createRateLimiter(LOGIN_REQUESTS_PER_MINUTE));
  app.use('/api/chat', createRateLimiter(CHAT_REQUESTS_PER_MINUTE));
  app.use('/api/action', createRateLimiter(CHAT_REQUESTS_PER_MINUTE));
  app.use('/api', createRateLimiter(API_REQUESTS_PER_MINUTE));

  // La sesión se resuelve antes que cualquier ruta: `req.session` existe (o no)
  // de forma uniforme para todas ellas.
  app.use(attachSession);
  app.use(enforceAuthIfConfigured);

  app.use(authRouter);
  app.use(healthRouter);
  app.use(a2uiRouter);
  app.use(dashboardRouter);
  app.use(customerRouter);
  app.use(overviewRouter);
  app.use(creditRouter);
  app.use(voiceRouter);
  app.use(createHistoryRouter({ historyStore }));
  app.use(createChatRouter({ runAgent: agent, historyStore }));

  app.use(errorHandler);
  return app;
}

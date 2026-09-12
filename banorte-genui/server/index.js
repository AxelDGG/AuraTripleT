// Servidor HTTP: sirve el frontend y expone /api/chat con streaming SSE
// para que la interfaz generada llegue en tiempo real.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { runAgent } from './agent.js';
import { getMcpClient, callMcpTool } from './mcp/client.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3040;

// CORS para la app móvil (Expo en dispositivo/emulador y expo web).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiting simple en memoria por IP (ventana deslizante de un minuto).
const RATE_LIMIT_WINDOW_MS = 60_000;

function createRateLimiter(maxRequests) {
  const requestLog = new Map();
  const prune = (now) => {
    for (const [ip, times] of requestLog) {
      const alive = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (alive.length) requestLog.set(ip, alive);
      else requestLog.delete(ip);
    }
  };
  return (req, res, next) => {
    const now = Date.now();
    prune(now);
    const ip = req.ip ?? 'unknown';
    const recent = requestLog.get(ip) ?? [];
    if (recent.length >= maxRequests) {
      res.status(429).json({ ok: false, error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' });
      return;
    }
    recent.push(now);
    requestLog.set(ip, recent);
    next();
  };
}

// El agente (LLM) es el recurso caro: 20/min. El resto de la API: 120/min.
app.use('/api/chat', createRateLimiter(20));
app.use('/api', createRateLimiter(120));

app.get('/api/health', async (_req, res) => {
  try {
    await getMcpClient();
    res.json({ ok: true, mcp: 'connected', model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// Datos del dashboard: se obtienen en paralelo vía MCP (misma fuente que el agente).
const DASHBOARD_CALLS = [
  ['customer', 'get_customer_profile', {}],
  ['portfolio', 'get_portfolio', {}],
  ['watchlist', 'get_watchlist', { filter: 'most_viewed' }],
  ['performance', 'get_portfolio_performance', { range: 'ALL' }],
  ['accounts', 'get_accounts', {}],
  ['investments', 'get_investments', {}],
  ['spending', 'get_spending_by_category', {}],
  ['cashflow', 'get_monthly_cashflow', {}],
  ['exchangeRates', 'get_exchange_rates', {}],
  ['transactions', 'get_transactions', { limit: 12 }],
  ['creditProducts', 'list_credit_products', {}],
  ['beneficiaries', 'get_beneficiaries', {}],
];

app.get('/api/dashboard', async (_req, res) => {
  try {
    const entries = await Promise.all(
      DASHBOARD_CALLS.map(async ([key, tool, args]) => [key, JSON.parse(await callMcpTool(tool, args))]),
    );
    res.json({ ok: true, data: Object.fromEntries(entries), generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[dashboard] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el dashboard.' });
  }
});

app.post('/api/simulate-credit', async (req, res) => {
  const { productId, amount, months } = req.body ?? {};
  const amountNumber = Number(amount);
  const monthsNumber = Number(months);
  if (typeof productId !== 'string' || !Number.isFinite(amountNumber) || !Number.isFinite(monthsNumber)) {
    res.status(400).json({ ok: false, error: 'productId, amount y months son requeridos.' });
    return;
  }
  try {
    const result = JSON.parse(await callMcpTool('simulate_credit', {
      productId: productId.slice(0, 20),
      amount: amountNumber,
      months: Math.round(monthsNumber),
    }));
    res.json({ ok: !result.error, data: result.error ? null : result, error: result.error ?? null });
  } catch (err) {
    console.error('[simulate-credit] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo simular el crédito.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body ?? {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'El campo "message" es requerido.' });
    return;
  }
  if (message.length > 4000) {
    res.status(400).json({ error: 'El mensaje excede el límite de 4000 caracteres.' });
    return;
  }
  const safeHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    : [];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Si el cliente cierra la pestaña a mitad del stream, se aborta el agente
  // y se dejan de escribir eventos sobre un socket muerto.
  // Nota: en Node >= 16 `req` emite 'close' al terminar de leer el body, así que
  // la desconexión real del cliente se detecta en `res` (o en el socket).
  const abort = new AbortController();
  let isClientGone = false;
  res.on('close', () => {
    if (res.writableFinished) return;
    isClientGone = true;
    abort.abort();
  });

  const emit = (event) => {
    if (isClientGone) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      console.error('[sse] fallo al escribir:', err.message);
    }
  };

  try {
    await runAgent({ userMessage: message.trim(), history: safeHistory, emit, signal: abort.signal });
  } catch (err) {
    console.error('[agent] error:', err);
    emit({ type: 'error', text: `Ocurrió un error: ${String(err.message || err).slice(0, 300)}` });
  } finally {
    emit({ type: 'done' });
    if (!isClientGone) res.end();
  }
});

// Manejador de errores final: nunca exponer stack traces al cliente.
app.use((err, _req, res, _next) => {
  console.error('[http] error:', err.message);
  const status = err.type === 'entity.parse.failed' || err.type === 'entity.too.large' ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Solicitud inválida.' : 'Error interno del servidor.' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[process] promesa rechazada sin manejar:', reason);
});

app.listen(PORT, () => {
  console.log(`Banorte GenUI corriendo en http://localhost:${PORT}`);
  // Precalentar la conexión MCP para que la primera consulta sea rápida.
  getMcpClient()
    .then(() => console.log('[MCP] conexión establecida'))
    .catch((err) => console.error('[MCP] error al conectar:', err.message));
});

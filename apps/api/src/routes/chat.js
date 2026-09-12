// POST /api/chat: corre al agente y transmite cada paso por Server-Sent Events
// (status, tool_call, tool_result, ui, error, done) para que la interfaz
// generada llegue en tiempo real.

import { Router } from 'express';

const MAX_MESSAGE_CHARS = 4000;
const ALLOWED_HISTORY_ROLES = new Set(['user', 'assistant']);

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && ALLOWED_HISTORY_ROLES.has(m.role) && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

function validateMessage(message) {
  if (!message || typeof message !== 'string' || !message.trim()) return 'El campo "message" es requerido.';
  if (message.length > MAX_MESSAGE_CHARS) return `El mensaje excede el límite de ${MAX_MESSAGE_CHARS} caracteres.`;
  return null;
}

function openSseStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

// `runAgent` se inyecta para poder probar la ruta sin un LLM real.
export function createChatRouter({ runAgent }) {
  const router = Router();

  router.post('/api/chat', async (req, res) => {
    const { message, history } = req.body ?? {};
    const validationError = validateMessage(message);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    openSseStream(res);

    // Si el cliente cierra la pestaña a mitad del stream, se aborta el agente
    // y se dejan de escribir eventos sobre un socket muerto. En Node >= 16 `req`
    // emite 'close' al terminar de leer el body, así que la desconexión real se
    // detecta en `res`.
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
      await runAgent({
        userMessage: message.trim(),
        history: sanitizeHistory(history),
        emit,
        signal: abort.signal,
      });
    } catch (err) {
      console.error('[agent] error:', err);
      emit({ type: 'error', text: `Ocurrió un error: ${String(err.message || err).slice(0, 300)}` });
    } finally {
      emit({ type: 'done' });
      if (!isClientGone) res.end();
    }
  });

  return router;
}

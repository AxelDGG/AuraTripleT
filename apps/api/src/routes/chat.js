// POST /api/chat y POST /api/action: corren al agente y transmiten cada paso
// por Server-Sent Events (status, tool_call, tool_result, a2ui, ui, history,
// error, done) para que la interfaz generada llegue en tiempo real.
//
// `a2ui` transporta los mensajes del protocolo (createSurface, updateComponents,
// updateDataModel, deleteSurface); `ui` cierra el turno con el resumen
// (título, carpeta, mensaje hablado, superficie completa y su proyección v1).
//
// /api/chat recibe texto libre; /api/action recibe un evento tipado de la UI
// generada (un Button o un Form). Los dos aceptan `surface` (la superficie que
// el cliente tiene en pantalla, para patches) y `client` (qué componentes sabe
// pintar, para negociar el catálogo).
//
// Al cerrar el stream, la interfaz generada se guarda en el historial (Tiger
// Data) con la carpeta que eligió la IA, y el evento `history` le devuelve al
// cliente la fila ya guardada para que la pinte sin volver a consultar.

import { Router } from 'express';
import { parseClientCapabilities, parseUserAction } from '@norte/a2ui-schema';
import { describeAction } from '../actions.js';
import { customerIdFor } from '../middleware/auth.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_SURFACE_ID_CHARS = 120;
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

// La superficie activa que manda el cliente: solo id, título y modelo.
function sanitizeSurface(surface) {
  if (!surface || typeof surface !== 'object' || typeof surface.surfaceId !== 'string') return null;
  const surfaceId = surface.surfaceId.trim().slice(0, MAX_SURFACE_ID_CHARS);
  if (!surfaceId) return null;
  return {
    surfaceId,
    title: typeof surface.title === 'string' ? surface.title.slice(0, 120) : undefined,
    dataModel: surface.dataModel && typeof surface.dataModel === 'object' && !Array.isArray(surface.dataModel) ? surface.dataModel : {},
  };
}

// Guardar el historial nunca debe tumbar la respuesta: si Tiger no está
// disponible se registra el error y el usuario igual ve su interfaz.
async function saveToHistory({ historyStore, generatedUi, userMessage, isClientGone, emit, customerId }) {
  // No se archiva nada si el cliente se fue a media respuesta, ni el aviso de
  // error que el agente emite cuando no logró producir una interfaz, ni un
  // patch (la superficie ya está archivada; solo cambiaron valores).
  if (!historyStore || !generatedUi || generatedUi.fallback || generatedUi.patch || isClientGone) return;
  try {
    const entry = await historyStore.add({
      folder: generatedUi.folder,
      title: generatedUi.title,
      prompt: userMessage,
      message: generatedUi.message,
      spec: {
        message: generatedUi.message,
        ui: generatedUi.ui,
        ...(generatedUi.surface ? { surface: generatedUi.surface } : {}),
      },
      ...(customerId ? { customerId } : {}),
    });
    emit({ type: 'history', entry });
  } catch (err) {
    console.error('[history] no se pudo guardar la visualización:', err.message);
  }
}

function openSseStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

// `runAgent` y `historyStore` se inyectan para poder probar la ruta sin un LLM
// real ni base de datos.
export function createChatRouter({ runAgent, historyStore }) {
  const router = Router();

  async function handleTurn(req, res, { userMessage, action }) {
    const { history, surface, client } = req.body ?? {};
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

    // Se guarda el último `ui` del turno: si el agente tuvo que reparar su JSON,
    // el que vale es el bueno, no el intento fallido.
    let generatedUi = null;
    const emitAndCapture = (event) => {
      if (event?.type === 'ui') generatedUi = event;
      emit(event);
    };

    try {
      await runAgent({
        userMessage,
        history: sanitizeHistory(history),
        emit: emitAndCapture,
        signal: abort.signal,
        action,
        surface: sanitizeSurface(surface),
        client: parseClientCapabilities(client),
      });
    } catch (err) {
      console.error('[agent] error:', err);
      emit({ type: 'error', text: `Ocurrió un error: ${String(err.message || err).slice(0, 300)}` });
    } finally {
      await saveToHistory({
        historyStore,
        generatedUi,
        userMessage,
        isClientGone,
        emit,
        customerId: customerIdFor(req),
      });
      emit({ type: 'done' });
      if (!isClientGone) res.end();
    }
  }

  router.post('/api/chat', async (req, res) => {
    const { message } = req.body ?? {};
    const validationError = validateMessage(message);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    await handleTurn(req, res, { userMessage: message.trim(), action: null });
  });

  // Evento tipado desde la UI generada. El contexto ya viene resuelto por el
  // cliente; aquí se valida la forma y el agente decide qué herramienta ejecutar.
  router.post('/api/action', async (req, res) => {
    const action = parseUserAction(req.body ?? {});
    if (!action) {
      res.status(400).json({ error: 'Acción inválida: se requiere surfaceId y event {name, context}.' });
      return;
    }
    const userMessage = describeAction(action).slice(0, MAX_MESSAGE_CHARS);
    await handleTurn(req, res, { userMessage, action });
  });

  return router;
}

// Agente generativo: orquesta un LLM (proveedor intercambiable) + herramientas
// MCP y produce superficies Norte A2UI que los clientes renderizan en tiempo real.
//
// El turno se transmite por partes (ver a2ui-stream.js): en cuanto el modelo
// pide herramientas ya sale un esqueleto, y la interfaz final llega en varios
// envíos de la raíz hacia abajo. Si la persona sigue sobre la misma pantalla
// ("¿y a 6 meses?"), el modelo puede responder con un patch: solo cambian
// valores del dataModel y la superficie se reconfigura sin reconstruirse.
//
// El turno son dos llamadas con prompts distintos (ver prompt.js): la primera
// elige herramientas y solo lleva sus esquemas; la segunda arma la interfaz con
// los resultados ya en el turno del usuario y ya no manda las herramientas.
// Cada mitad pesa ~3.5k tokens, así que mandarlas siempre las dos costaba el
// doble contra el presupuesto por minuto del orquestador.

import { DEFAULT_FOLDER, degradeComponents, newSurfaceId } from '@norte/a2ui-schema';
import { CONFIRMABLE_TOOLS, authorizedTools, describeAction, toolForAction } from './actions.js';
import { createA2uiEmitter, skeletonSurface } from './a2ui-stream.js';
import { listToolsForLlm, callMcpTool } from './mcp-client.js';
import { buildSystemPrompt, toolDataBlock, TOOL_PHASE, UI_PHASE } from './prompt.js';
import { getLlmProvider } from './providers/index.js';
import { parseAgentReply } from './ui-spec.js';

// Intentos de la fase de interfaz: el primero y una reparación.
const MAX_GENERATION_ATTEMPTS = 2;
// Del JSON que no se pudo leer solo se reenvía el principio: identificarlo no
// necesita las 2.5k tokens que puede ocupar la respuesta completa.
const FAILED_REPLY_STUB_CHARS = 200;
const MAX_HISTORY_MESSAGES = 10;
const TOOL_RESULT_PREVIEW_CHARS = 220;
// Cuánto del modelo de datos de la superficie activa se le muestra al modelo.
const ACTIVE_MODEL_MAX_CHARS = 2500;

const REPAIR_PROMPT =
  'Tu respuesta no fue JSON válido. Responde ÚNICAMENTE con el objeto JSON {"message":"...","title":"...","folder":"...","dataModel":{...},"ui":[...]} sin ningún texto adicional.';

function buildFallbackReply() {
  return {
    kind: 'surface',
    message: 'No pude generar la interfaz en este momento. Intenta reformular tu solicitud.',
    title: 'Sin respuesta del agente',
    folder: DEFAULT_FOLDER,
    ui: [{ type: 'alert', level: 'error', text: 'El agente no produjo una respuesta válida tras varios intentos.' }],
    surface: {
      surfaceId: newSurfaceId(),
      components: [
        { id: 'root', component: 'Stack', children: ['fallback'] },
        { id: 'fallback', component: 'Alert', level: 'error', text: 'El agente no produjo una respuesta válida tras varios intentos.' },
      ],
      dataModel: {},
    },
  };
}

// Lo que el normalizador tuvo que descartar o reparar del JSON del modelo, más
// lo que hubo que degradar para este cliente. Sin esta línea el único síntoma
// de un componente inventado es "la pantalla salió incompleta".
function logSurfaceWarnings(surfaceId, warnings, notes) {
  const parts = [];
  if (warnings?.dropped?.length) parts.push(`componentes desconocidos descartados: ${warnings.dropped.join(', ')}`);
  if (warnings?.repairedControls?.length) {
    parts.push(`controles sin ruta reparados: ${warnings.repairedControls.map((c) => `${c.component}→${c.path}`).join(', ')}`);
  }
  if (warnings?.deadButtons?.length) parts.push(`botones sin acción quitados: ${warnings.deadButtons.length}`);
  if (warnings?.inlineBindings?.length) {
    parts.push(`bindings escritos como texto rescatados: ${warnings.inlineBindings.map((b) => b.id).join(', ')}`);
  }
  if (notes?.length) parts.push(`degradados para este cliente: ${notes.map((n) => `${n.from}→${n.to ?? 'quitado'}`).join(', ')}`);
  if (parts.length) console.warn(`[a2ui] superficie ${surfaceId}: ${parts.join(' · ')}`);
}

function parseToolArgs(call) {
  try {
    return JSON.parse(call.function.arguments || '{}');
  } catch {
    return {};
  }
}

// Ejecuta las tool calls vía MCP y devuelve {name, content} por herramienta.
// Los resultados no viajan como mensajes `tool`: la fase de interfaz los recibe
// como texto, así no hay que declarar las herramientas otra vez para que el
// proveedor acepte la conversación.
async function executeToolCalls(toolCalls, { authorized, emit }) {
  const results = [];
  for (const call of toolCalls) {
    const name = call.function.name;
    let args = parseToolArgs(call);
    // Compuerta de confirmación en código: el modelo no puede autorizar una
    // operación con dinero; solo un envío explícito (formulario o botón) lo hace.
    if (CONFIRMABLE_TOOLS.has(name)) {
      args = { ...args, confirmed: authorized.has(name) };
    }
    emit({ type: 'tool_call', name, args });
    let resultText;
    try {
      resultText = await callMcpTool(name, args);
    } catch (err) {
      resultText = JSON.stringify({ error: String(err.message || err) });
    }
    emit({ type: 'tool_result', name, preview: resultText.slice(0, TOOL_RESULT_PREVIEW_CHARS) });
    results.push({ name, content: resultText });
  }
  return results;
}

// Resumen del modelo de datos para el prompt: las listas largas (opciones de
// un plan, movimientos) se recortan; el modelo necesita las rutas y los valores
// que la persona movió, no cada fila. Cada token cuenta contra el presupuesto
// por minuto del orquestador.
const MODEL_LIST_PREVIEW = 3;
function summarizeModel(value, depth = 0) {
  if (Array.isArray(value)) {
    if (value.length <= MODEL_LIST_PREVIEW || depth > 6) return value.map((v) => summarizeModel(v, depth + 1));
    return [...value.slice(0, MODEL_LIST_PREVIEW).map((v) => summarizeModel(v, depth + 1)), `…(${value.length} en total)`];
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = summarizeModel(item, depth + 1);
    return out;
  }
  return value;
}

// Lo que el agente recuerda de la persona (memory-store.js): hechos cortos
// recuperados por parecido con la pregunta. Van como mensaje de sistema aparte
// del prompt para que el proveedor los pueda cachear por separado.
const MAX_MEMORIES = 8;
function memoryMessage(memories) {
  const items = (Array.isArray(memories) ? memories : [])
    .map((m) => (typeof m === 'string' ? m : m?.content))
    .filter((text) => typeof text === 'string' && text.trim())
    .slice(0, MAX_MEMORIES);
  if (!items.length) return null;
  return {
    role: 'system',
    content: `MEMORIA DEL CLIENTE (aprendida en conversaciones anteriores; personaliza con esto sin recitarlo ni inventar más):\n${items.map((text) => `- ${text.trim()}`).join('\n')}`,
  };
}

// Contexto de la superficie que la persona tiene en pantalla: el id (para los
// patches) y su modelo de datos (lo que la persona movió antes de preguntar).
function activeSurfaceMessage(surface) {
  if (!surface?.surfaceId) return null;
  let model = '';
  try {
    model = JSON.stringify(summarizeModel(surface.dataModel ?? {}));
  } catch {
    model = '{}';
  }
  if (model.length > ACTIVE_MODEL_MAX_CHARS) model = `${model.slice(0, ACTIVE_MODEL_MAX_CHARS)}…`;
  return {
    role: 'system',
    content: `SUPERFICIE ACTIVA: surfaceId "${surface.surfaceId}"${surface.title ? ` ("${surface.title}")` : ''}. Su dataModel actual es: ${model}. Si la persona solo cambia un valor de esta pantalla, responde con un patch sobre este surfaceId.`,
  };
}

export async function runAgent({
  userMessage,
  history = [],
  emit,
  signal,
  provider = getLlmProvider(),
  // Norte A2UI v2
  action = null,
  surface = null,
  client = null,
  streamDelayMs,
  // Memoria de largo plazo: hechos sobre la persona que la ruta recuperó de Tiger.
  memories = [],
}) {
  const authorized = authorizedTools({ userMessage, action });
  const a2ui = createA2uiEmitter(emit);
  const surfaceId = newSurfaceId();
  const clientComponents = client?.components;
  let skeletonShown = false;

  const streamOptions = { delayMs: streamDelayMs, signal };
  if (streamOptions.delayMs === undefined) delete streamOptions.delayMs;

  // El contexto que las dos fases comparten: lo que Norte recuerda, la
  // conversación reciente y la pantalla que la persona tiene enfrente.
  const memory = memoryMessage(memories);
  const active = activeSurfaceMessage(surface);
  const userTurn = action ? describeAction(action) : userMessage;
  const actionTool = action ? toolForAction(action) : null;
  const shared = [...(memory ? [memory] : []), ...history.slice(-MAX_HISTORY_MESSAGES), ...(active ? [active] : [])];

  const emitReply = (reply) => {
    if (reply.kind === 'patch') {
      logSurfaceWarnings(reply.surfaceId, reply.warnings, null);
      if (skeletonShown) a2ui.deleteSurface({ surfaceId });
      a2ui.streamPatch(reply.surfaceId, reply.updates);
      emit({
        type: 'ui',
        patch: true,
        surfaceId: reply.surfaceId,
        updates: reply.updates,
        message: reply.message,
        title: reply.title,
        folder: reply.folder,
        ui: [],
      });
      return reply;
    }
    // Segunda mitad de la negociación de catálogo: aunque el prompt ya solo
    // le ofreció al modelo lo que este cliente sabe pintar, la superficie se
    // adapta antes de salir. Así un cliente parcial nunca recibe un hueco.
    const degraded = degradeComponents(reply.surface.components, clientComponents);
    reply.surface.components = degraded.components;
    logSurfaceWarnings(reply.surface.surfaceId, reply.warnings, degraded.notes);
    return reply;
  };

  const onRateLimit = (waitSeconds) =>
    emit({ type: 'status', text: `Modelo saturado, reintentando en ${Math.ceil(waitSeconds)}s…` });

  emit({ type: 'status', text: 'Conectando con herramientas bancarias (MCP)...' });
  const tools = await listToolsForLlm();
  if (signal?.aborted) return null;

  emit({ type: 'status', text: 'Analizando tu solicitud...' });

  // ---------- fase 1: qué datos hacen falta ----------
  //
  // Una sola llamada: el prompt le pide que traiga TODO lo que necesite de una
  // vez, porque en la fase de interfaz ya no se mandan las herramientas. Si el
  // turno solo mueve un valor de la pantalla activa, aquí mismo sale el patch y
  // el turno termina en una llamada.
  const toolPhase = await provider.chat({
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt({ phase: TOOL_PHASE, userText: userTurn, hintTools: actionTool ? [actionTool] : null }),
      },
      ...shared,
      { role: 'user', content: userTurn },
    ],
    tools,
    onRateLimit,
  });
  if (signal?.aborted) return null;

  let results = [];
  if (toolPhase.tool_calls?.length) {
    // Ya sabemos qué tipo de pantalla viene: el esqueleto sale antes de que
    // regrese el primer dato.
    a2ui.createSurface(skeletonSurface(surfaceId, toolPhase.tool_calls.map((c) => c.function.name)));
    skeletonShown = true;
    results = await executeToolCalls(toolPhase.tool_calls, { authorized, emit });
    emit({ type: 'status', text: 'Generando tu interfaz...' });
  } else {
    // Sin herramientas el modelo pudo haber resuelto ya un patch sobre la
    // superficie activa (no necesita catálogo ni datos nuevos): se acepta y no
    // se paga la segunda llamada.
    const early = parseAgentReply(toolPhase.content, { activeSurfaceId: surface?.surfaceId, surfaceId });
    if (early?.kind === 'patch') return emitReply(early);
  }

  // ---------- fase 2: armar la interfaz ----------
  //
  // Sin `tools` (~3.6k tokens) y con el prompt de interfaz, que solo incluye el
  // flujo y la guía de gráficas de las herramientas que de verdad corrieron.
  const calledTools = results.map((r) => r.name);
  const uiMessages = [
    { role: 'system', content: buildSystemPrompt({ clientComponents, phase: UI_PHASE, calledTools }) },
    ...shared,
    { role: 'user', content: `${userTurn}${toolDataBlock(results)}` },
  ];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    if (signal?.aborted) return null;
    const assistantMsg = await provider.chat({ messages: uiMessages, onRateLimit });
    if (signal?.aborted) return null;

    const reply = parseAgentReply(assistantMsg.content, { activeSurfaceId: surface?.surfaceId, surfaceId });
    if (reply) {
      const ready = emitReply(reply);
      if (ready.kind === 'patch') return ready;
      await a2ui.streamSurface(ready.surface, { skeletonShown, ...streamOptions });
      emit({
        type: 'ui',
        surfaceId: ready.surface.surfaceId,
        surface: ready.surface,
        message: ready.message,
        title: ready.title,
        folder: ready.folder,
        ui: ready.ui,
      });
      return ready;
    }

    // Reintento de reparación: pedir solo el JSON. Del intento fallido se
    // reenvía un muñón, no el texto completo: puede ser toda la respuesta
    // (hasta 2.5k tokens) y para el modelo basta con ver por dónde empezó.
    uiMessages.push({ role: 'assistant', content: String(assistantMsg.content ?? '').slice(0, FAILED_REPLY_STUB_CHARS) });
    uiMessages.push({ role: 'user', content: REPAIR_PROMPT });
  }

  const fallback = buildFallbackReply();
  if (skeletonShown) a2ui.deleteSurface({ surfaceId });
  await a2ui.streamSurface(fallback.surface, { skeletonShown: false, ...streamOptions });
  emit({ type: 'ui', ...fallback, kind: undefined, surfaceId: fallback.surface.surfaceId, fallback: true });
  return fallback;
}

export { buildSystemPrompt };

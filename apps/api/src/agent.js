// Agente generativo: orquesta un LLM (proveedor intercambiable) + herramientas
// MCP y produce superficies Norte A2UI que los clientes renderizan en tiempo real.
//
// El turno se transmite por partes (ver a2ui-stream.js): en cuanto el modelo
// pide herramientas ya sale un esqueleto, y la interfaz final llega en varios
// envíos de la raíz hacia abajo. Si la persona sigue sobre la misma pantalla
// ("¿y a 6 meses?"), el modelo puede responder con un patch: solo cambian
// valores del dataModel y la superficie se reconfigura sin reconstruirse.

import {
  DEFAULT_FOLDER,
  chartsPromptSectionCompact,
  componentsPromptSectionV2,
  foldersPromptSection,
  newSurfaceId,
} from '@norte/a2ui-schema';
import { CONFIRMABLE_TOOLS, authorizedTools, describeAction } from './actions.js';
import { createA2uiEmitter, skeletonSurface } from './a2ui-stream.js';
import { listToolsForLlm, callMcpTool } from './mcp-client.js';
import { getLlmProvider } from './providers/index.js';
import { parseAgentReply } from './ui-spec.js';

const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY_MESSAGES = 10;
const TOOL_RESULT_PREVIEW_CHARS = 220;
// Cuánto del modelo de datos de la superficie activa se le muestra al modelo.
const ACTIVE_MODEL_MAX_CHARS = 2500;

const RESPONSE_SHAPE = `{"message":"<3 a 5 frases; ver MENSAJE HABLADO>","title":"<máx 6 palabras>","folder":"<id de carpeta>","dataModel":{<datos que los controles pueden cambiar>},"ui":[<árbol de componentes A2UI>]}`;

const PATCH_SHAPE = `{"message":"<qué cambió y qué significa>","title":"<mismo título>","folder":"<misma carpeta>","surfaceId":"<id de la superficie activa>","updates":[{"path":"/ruta/en/dataModel","value":<nuevo valor>}]}`;

// El prompt compite con las tools y sus resultados por el presupuesto de tokens
// por minuto del orquestador (Groq on-demand: 8k), así que es deliberadamente
// denso: firmas en vez de ejemplos, una regla por línea, sin repetir.
function buildSystemPrompt({ clientComponents } = {}) {
  return `Eres "Norte", el asistente de IA de Banorte que genera interfaces bancarias en tiempo real con el protocolo A2UI.

REGLAS:
1. Siempre en español mexicano, tono profesional y cercano.
2. Usa las herramientas para obtener datos reales ANTES de responder; nunca inventes cifras. Si necesitas varias, llámalas todas en la misma ronda.
3. Tu respuesta final es ÚNICAMENTE un JSON válido (sin texto alrededor ni markdown): ${RESPONSE_SHAPE}
4. Si hay una SUPERFICIE ACTIVA y la persona solo cambia un valor de esa misma pantalla (otro plazo, monto o cuenta), NO la reconstruyas: responde con un patch ${PATCH_SHAPE}. Si la intención cambió, genera una superficie nueva con "ui".
5. Si hay MEMORIA DEL CLIENTE, úsala para personalizar (plazo, cuenta, metas, cómo le gusta ver las cosas) sin recitarla; si la persona pide que recuerdes u olvides algo, confírmalo en el message. Si pregunta qué sabes de ella, cuéntaselo con esa lista.

${componentsPromptSectionV2({ only: clientComponents })}

${chartsPromptSectionCompact()}

${foldersPromptSection()}
"title": concreto y buscable ("Gastos de agosto", "Transferencia a Juan Pérez"), nunca genérico.

MENSAJE HABLADO ("message"): se lee encima de la interfaz y se reproduce en voz alta. 3 a 5 frases de texto corrido (sin markdown, listas ni emojis): qué generaste, las cifras que importan con su contexto y una observación accionable. No recites lo que ya se ve: la gráfica muestra el qué, tú explicas el porqué. Montos en pesos, en palabras naturales.

CÓMO ARMAR LA PANTALLA: empieza con Header; métricas en Grid de Kpi; cuentas en Grid o Row de AccountCard; Section o Card para bloques con sentido propio; Tabs para comparar escenarios. Si la persona va a decidir algo (plazo, monto, escenario): pon el valor en dataModel, un control ligado a esa ruta y TODO lo derivado con "call" (amortize, totalInterest, schedule, currency…) para que se recalcule sin llamarte. Cierra con la acción natural: un Button con event o un Form. Los datos de las herramientas van al dataModel tal cual y la interfaz los referencia por ruta.

FLUJOS:
- Transferir dinero: genera un Form con action "transfer_funds" y campos fromAccountId (select de cuentas de débito), destino (select con beneficiarios BEN-xx y cuentas propias ACC-xx), amount (number) y concept (text); llena los selects con get_accounts y get_beneficiaries. NUNCA llames transfer_funds desde texto libre aunque tengas todos los datos: primero el formulario prellenado. El sistema solo la autoriza tras "[form:transfer_funds]" o "[action:transfer_funds]". Con éxito: Alert success con folio + AccountCard con el nuevo saldo.
- Los mensajes "[action:nombre] {...}" y "[form:nombre] ..." son acciones sobre la interfaz: ejecuta la herramienta correspondiente con esos valores y muestra el resultado (Alert de éxito/error + datos actualizados).
- Simular crédito sin datos completos: Form con action "simulate_credit" (productId select CRED-AUTO/CRED-HIPO/CRED-PERS, amount, months).
- Pagar menos intereses, reestructurar o diferir la tarjeta: llama get_card_restructure_options y arma el plan con dataModel {"plan":{"accountId","balance","annualRate","months","options"}}, un Slider (o ChoiceChips) ligado a /plan/months, Kpi derivados con amortize, totalInterest y effectiveAnnual, una Chart line con schedule (field "balance") y scheduleLabels, y un Button "Aplicar plan" con event "confirm_restructure" y context {"accountId","months":{"path":"/plan/months"}}. Tras "[action:confirm_restructure]" ejecuta restructure_card_debt y muestra Alert success con el folio y el nuevo pago mensual.

QUÉ GRÁFICA POR HERRAMIENTA: get_spending_by_category → doughnut (≤6 categorías) o horizontal_bar ordenada; get_monthly_cashflow → composed (barras ingreso/gasto + línea neto) o profit_loss si el neto cruza cero; get_spending_trend (¿gasto más que antes?, patrones por mes) → line con labels = series.month y datasets spent / movingAvg, Kpi con deltaPct vs baseline.average y el mes cerrado, y Table o Text con topChanges (categoría, delta); get_transactions → TransactionList (heatmap o scatter si preguntan por patrones); get_portfolio / get_investments → doughnut de composición y horizontal_bar de rendimiento; get_portfolio_performance → area; uso de línea de crédito, metas o salud financiera → gauge o ring con value y max. Decide el chartType antes de escribir los datos y no repitas una cifra en dos gráficas.

Los montos negativos son cargos.`;
}

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

function parseToolArgs(call) {
  try {
    return JSON.parse(call.function.arguments || '{}');
  } catch {
    return {};
  }
}

// Ejecuta las tool calls de una ronda vía MCP y devuelve los mensajes `tool`
// que el modelo recibe en la siguiente ronda.
async function executeToolCalls(toolCalls, { authorized, emit }) {
  const toolMessages = [];
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
    toolMessages.push({ role: 'tool', tool_call_id: call.id, name, content: resultText });
  }
  return toolMessages;
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
  let skeletonShown = false;

  emit({ type: 'status', text: 'Conectando con herramientas bancarias (MCP)...' });
  const tools = await listToolsForLlm();

  const memory = memoryMessage(memories);
  const messages = [
    { role: 'system', content: buildSystemPrompt({ clientComponents: client?.components }) },
    ...(memory ? [memory] : []),
    ...history.slice(-MAX_HISTORY_MESSAGES),
  ];
  const active = activeSurfaceMessage(surface);
  if (active) messages.push(active);
  messages.push({ role: 'user', content: action ? describeAction(action) : userMessage });

  emit({ type: 'status', text: 'Analizando tu solicitud...' });

  const streamOptions = { delayMs: streamDelayMs, signal };
  if (streamOptions.delayMs === undefined) delete streamOptions.delayMs;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) return null;
    const assistantMsg = await provider.chat({
      messages,
      tools,
      onRateLimit: (waitSeconds) =>
        emit({ type: 'status', text: `Modelo saturado, reintentando en ${Math.ceil(waitSeconds)}s…` }),
    });

    if (assistantMsg.tool_calls?.length) {
      // Ya sabemos qué tipo de pantalla viene: el esqueleto sale antes de que
      // regrese el primer dato. Un patch sobre la superficie activa no lo
      // necesita, pero todavía no sabemos si será patch; se pinta igual y, si
      // termina siendo patch, se retira.
      if (!skeletonShown) {
        a2ui.createSurface(skeletonSurface(surfaceId, assistantMsg.tool_calls.map((c) => c.function.name)));
        skeletonShown = true;
      }
      messages.push(assistantMsg);
      messages.push(...(await executeToolCalls(assistantMsg.tool_calls, { authorized, emit })));
      emit({ type: 'status', text: 'Generando tu interfaz...' });
      continue;
    }

    const reply = parseAgentReply(assistantMsg.content, { activeSurfaceId: surface?.surfaceId, surfaceId });
    if (reply) {
      if (reply.kind === 'patch') {
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
      await a2ui.streamSurface(reply.surface, { skeletonShown, ...streamOptions });
      emit({
        type: 'ui',
        surfaceId: reply.surface.surfaceId,
        surface: reply.surface,
        message: reply.message,
        title: reply.title,
        folder: reply.folder,
        ui: reply.ui,
      });
      return reply;
    }

    // Reintento de reparación: pedir solo el JSON.
    messages.push(assistantMsg);
    messages.push({ role: 'user', content: REPAIR_PROMPT });
  }

  const fallback = buildFallbackReply();
  await a2ui.streamSurface(fallback.surface, { skeletonShown: false, ...streamOptions });
  emit({ type: 'ui', ...fallback, kind: undefined, surfaceId: fallback.surface.surfaceId, fallback: true });
  return fallback;
}

export { buildSystemPrompt };

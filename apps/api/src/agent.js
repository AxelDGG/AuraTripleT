// Agente generativo: orquesta un LLM (proveedor intercambiable) + herramientas
// MCP y produce especificaciones de UI (Norte UI Spec) que los clientes
// renderizan en tiempo real.

import {
  DEFAULT_FOLDER,
  chartsPromptSection,
  componentsPromptSection,
  foldersPromptSection,
} from '@norte/a2ui-schema';
import { listToolsForLlm, callMcpTool } from './mcp-client.js';
import { getLlmProvider } from './providers/index.js';
import { parseUiJson } from './ui-spec.js';

const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY_MESSAGES = 10;
const TOOL_RESULT_PREVIEW_CHARS = 220;
// Solo un envío explícito del formulario de transferencia autoriza transfer_funds.
const CONFIRMED_TRANSFER_PATTERN = /^\[form:transfer_funds\]/;

const SYSTEM_PROMPT = `Eres "Norte", el asistente de IA de Banorte que genera interfaces bancarias en tiempo real.

REGLAS:
1. SIEMPRE respondes en español mexicano, tono profesional y cercano.
2. Usa las herramientas disponibles para obtener datos reales del cliente ANTES de responder. Nunca inventes cifras. Si necesitas varias herramientas, llámalas TODAS en la misma ronda (tool calls en paralelo).
3. Tu respuesta final DEBE ser ÚNICAMENTE un objeto JSON válido (sin texto antes ni después, sin markdown) con esta forma:
{"message": "<resumen breve y útil en 1-3 frases>", "title": "<título corto, máx 6 palabras>", "folder": "<id de carpeta>", "ui": [<componentes>]}

${componentsPromptSection()}

${chartsPromptSection()}

${foldersPromptSection()}
El "title" es como se guarda la visualización en el historial: concreto y buscable ("Gastos de agosto", "Transferencia a Juan Pérez"), nunca genérico ("Resultado", "Tu consulta").

FLUJOS INTERACTIVOS:
- Si el usuario quiere transferir dinero y faltan datos, genera un "form" con action "transfer_funds": campos fromAccountId (select con cuentas de débito), destino (select con beneficiarios BEN-xx y cuentas propias ACC-xx), amount (number) y concept (text). Consulta primero get_accounts y get_beneficiaries para llenar los selects con opciones reales.
- Los mensajes que empiezan con "[form:accion]" son envíos de formulario: ejecuta la herramienta correspondiente con esos valores y muestra el resultado (alert de éxito/error + datos actualizados).
- NUNCA llames transfer_funds a partir de texto libre, aunque el usuario dé todos los datos: primero genera el formulario (prellenado con los valores que ya te dio) para que lo confirme. El sistema solo autoriza transfer_funds tras un envío "[form:transfer_funds]".
- Para transfer_funds ejecutado con éxito muestra: alert success con folio, y balance_cards con el nuevo saldo.
- Si el usuario pide simular un crédito sin datos completos, genera un form con action "simulate_credit" (productId select con CRED-AUTO/CRED-HIPO/CRED-PERS, amount number, months number).

VISUALIZACIÓN DE DATOS (qué herramienta alimenta qué gráfica):
- get_spending_by_category: doughnut con 6 categorías o menos, horizontal_bar ordenada si son más. Si el usuario tiene presupuesto, manda "target".
- get_monthly_cashflow: composed con barras de ingreso y gasto más una línea de flujo neto; si lo importante es el neto y cruza el cero, profit_loss.
- get_transactions: transaction_list para el detalle. Si preguntan por patrones, heatmap (día de la semana × semana) o scatter (monto contra frecuencia).
- get_portfolio / get_investments: doughnut de composición y horizontal_bar de rendimiento por posición.
- get_portfolio_performance: area para el valor acumulado; candlestick solo si los datos traen apertura, máximo, mínimo y cierre.
- Uso de la línea de crédito, avance de una meta de ahorro o salud financiera: gauge o ring con "value" y "max".
- Decide el chartType ANTES de escribir los datos, y no repitas la misma cifra en dos gráficas de la misma vista.

Los montos negativos son cargos. Formatea montos en el message como pesos mexicanos.`;

const REPAIR_PROMPT =
  'Tu respuesta no fue JSON válido. Responde ÚNICAMENTE con el objeto JSON {"message":"...","title":"...","folder":"...","ui":[...]} sin ningún texto adicional.';

function buildFallbackSpec() {
  return {
    message: 'No pude generar la interfaz en este momento. Intenta reformular tu solicitud.',
    title: 'Sin respuesta del agente',
    folder: DEFAULT_FOLDER,
    ui: [{ type: 'alert', level: 'error', text: 'El agente no produjo una respuesta válida tras varios intentos.' }],
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
async function executeToolCalls(toolCalls, { isConfirmedTransfer, emit }) {
  const toolMessages = [];
  for (const call of toolCalls) {
    const name = call.function.name;
    let args = parseToolArgs(call);
    // Compuerta de confirmación en código: el modelo no puede autorizar una
    // transferencia; solo el envío explícito del formulario lo hace.
    if (name === 'transfer_funds') {
      args = { ...args, confirmed: isConfirmedTransfer };
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

export async function runAgent({ userMessage, history = [], emit, signal, provider = getLlmProvider() }) {
  const isConfirmedTransfer = CONFIRMED_TRANSFER_PATTERN.test(userMessage);

  emit({ type: 'status', text: 'Conectando con herramientas bancarias (MCP)...' });
  const tools = await listToolsForLlm();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY_MESSAGES),
    { role: 'user', content: userMessage },
  ];

  emit({ type: 'status', text: 'Analizando tu solicitud...' });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) return null;
    const assistantMsg = await provider.chat({
      messages,
      tools,
      onRateLimit: (waitSeconds) =>
        emit({ type: 'status', text: `Modelo saturado, reintentando en ${Math.ceil(waitSeconds)}s…` }),
    });

    if (assistantMsg.tool_calls?.length) {
      messages.push(assistantMsg);
      messages.push(...(await executeToolCalls(assistantMsg.tool_calls, { isConfirmedTransfer, emit })));
      emit({ type: 'status', text: 'Generando tu interfaz...' });
      continue;
    }

    const parsed = parseUiJson(assistantMsg.content);
    if (parsed) {
      emit({ type: 'ui', message: parsed.message, ui: parsed.ui, folder: parsed.folder, title: parsed.title });
      return parsed;
    }

    // Reintento de reparación: pedir solo el JSON.
    messages.push(assistantMsg);
    messages.push({ role: 'user', content: REPAIR_PROMPT });
  }

  const fallback = buildFallbackSpec();
  emit({ type: 'ui', ...fallback, fallback: true });
  return fallback;
}

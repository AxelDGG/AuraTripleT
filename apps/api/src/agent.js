// Agente generativo: orquesta Groq (LLM) + herramientas MCP y produce
// especificaciones de UI en JSON que el frontend renderiza en tiempo real.

import { listToolsForLlm, callMcpTool } from './mcp-client.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `Eres "Norte", el asistente de IA de Banorte que genera interfaces bancarias en tiempo real.

REGLAS:
1. SIEMPRE respondes en español mexicano, tono profesional y cercano.
2. Usa las herramientas disponibles para obtener datos reales del cliente ANTES de responder. Nunca inventes cifras. Si necesitas varias herramientas, llámalas TODAS en la misma ronda (tool calls en paralelo).
3. Tu respuesta final DEBE ser ÚNICAMENTE un objeto JSON válido (sin texto antes ni después, sin markdown) con esta forma:
{"message": "<resumen breve y útil en 1-3 frases>", "ui": [<componentes>]}

COMPONENTES DE UI DISPONIBLES (elige los que mejor comuniquen la respuesta, usualmente 2-5):
- {"type":"header","title":"...","subtitle":"...","badge":"..."} — encabezado de la vista.
- {"type":"kpi_grid","items":[{"label":"...","value":"$48,250.75","delta":"+12%","trend":"up|down|neutral","icon":"💰"}]} — métricas clave (2-4 items).
- {"type":"balance_cards","accounts":[{"name":"...","number":"**** 4821","balance":48250.75,"currency":"MXN","kind":"checking|savings|credit","extra":"texto opcional"}]} — tarjetas de cuentas.
- {"type":"chart","chartType":"bar|line|pie|doughnut","title":"...","labels":["..."],"datasets":[{"label":"...","data":[123,456]}]} — gráficas (usa pie/doughnut para categorías, bar/line para comparaciones y tendencias).
- {"type":"table","title":"...","columns":["..."],"rows":[["..."]]} — datos tabulares.
- {"type":"transaction_list","title":"...","items":[{"date":"2026-09-01","description":"...","category":"...","amount":-299.0}]} — movimientos.
- {"type":"form","title":"...","description":"...","submitLabel":"...","action":"nombre_accion","fields":[{"name":"...","label":"...","inputType":"text|number|select","options":[{"value":"...","label":"..."}],"placeholder":"...","value":"..."}]} — formularios interactivos (transferencias, simulaciones).
- {"type":"alert","level":"info|success|warning|error","title":"...","text":"..."} — avisos y confirmaciones.
- {"type":"progress","label":"...","value":65,"caption":"..."} — barras de progreso (uso de crédito, metas).
- {"type":"text","markdown":"..."} — texto libre breve.

FLUJOS INTERACTIVOS:
- Si el usuario quiere transferir dinero y faltan datos, genera un "form" con action "transfer_funds": campos fromAccountId (select con cuentas de débito), destino (select con beneficiarios BEN-xx y cuentas propias ACC-xx), amount (number) y concept (text). Consulta primero get_accounts y get_beneficiaries para llenar los selects con opciones reales.
- Los mensajes que empiezan con "[form:accion]" son envíos de formulario: ejecuta la herramienta correspondiente con esos valores y muestra el resultado (alert de éxito/error + datos actualizados).
- NUNCA llames transfer_funds a partir de texto libre, aunque el usuario dé todos los datos: primero genera el formulario (prellenado con los valores que ya te dio) para que lo confirme. El sistema solo autoriza transfer_funds tras un envío "[form:transfer_funds]".
- Para transfer_funds ejecutado con éxito muestra: alert success con folio, y balance_cards con el nuevo saldo.
- Si el usuario pide simular un crédito sin datos completos, genera un form con action "simulate_credit" (productId select con CRED-AUTO/CRED-HIPO/CRED-PERS, amount number, months number).
- Para gráficas de gastos usa get_spending_by_category; para tendencias usa get_monthly_cashflow.

Los montos negativos son cargos. Formatea montos en el message como pesos mexicanos.`;

export function parseUiJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!Array.isArray(parsed.ui)) parsed.ui = [];
    if (typeof parsed.message !== 'string') parsed.message = '';
    return parsed;
  } catch {
    return null;
  }
}

const MAX_RATE_LIMIT_RETRIES = 4;
const MAX_RETRY_WAIT_SECONDS = 25;
const GROQ_TIMEOUT_MS = 60_000;

// Si el texto es un envoltorio de tool call {"name":"json","arguments":{...}},
// devuelve el contenido interno como string JSON; si no, null.
function unwrapToolCallWrapper(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!obj || typeof obj.name !== 'string') return null;
    const inner = obj.arguments ?? obj.parameters;
    if (inner && typeof inner === 'object') return JSON.stringify(inner);
    if (typeof inner === 'string') return inner;
  } catch {
    // No es un envoltorio válido; se intenta con el texto original.
  }
  return null;
}

export function extractFailedGeneration(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const failed = parsed?.error?.failed_generation;
  if (parsed?.error?.code !== 'tool_use_failed' || typeof failed !== 'string') return null;
  const candidate = unwrapToolCallWrapper(failed) ?? failed;
  return parseUiJson(candidate) ? candidate : null;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Groq API: tiempo de espera agotado (${timeoutMs / 1000}s).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function groqChat({ apiKey, model, messages, tools, onRateLimit }) {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetchWithTimeout(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2500,
      }),
    }, GROQ_TIMEOUT_MS);
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const body = await res.text();
      const match = body.match(/try again in ([\d.]+)s/i);
      const waitSeconds = Math.min(match ? parseFloat(match[1]) + 1 : 8, MAX_RETRY_WAIT_SECONDS);
      onRateLimit?.(waitSeconds, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      // gpt-oss a veces emite el JSON final como una tool call inexistente ("json").
      // Groq lo rechaza con 400 pero devuelve el texto generado; lo recuperamos.
      const recovered = extractFailedGeneration(body);
      if (res.status === 400 && recovered) {
        return { role: 'assistant', content: recovered };
      }
      throw new Error(`Groq API ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = await res.json();
    return data.choices[0].message;
  }
  throw new Error('Groq API: límite de velocidad persistente tras varios reintentos.');
}

export async function runAgent({ userMessage, history = [], emit, signal }) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  if (!apiKey) throw new Error('Falta GROQ_API_KEY en .env');

  const isConfirmedTransfer = /^\[form:transfer_funds\]/.test(userMessage);

  emit({ type: 'status', text: 'Conectando con herramientas bancarias (MCP)...' });
  const tools = await listToolsForLlm();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: userMessage },
  ];

  emit({ type: 'status', text: 'Analizando tu solicitud...' });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) return null;
    const assistantMsg = await groqChat({
      apiKey,
      model,
      messages,
      tools,
      onRateLimit: (waitSeconds) =>
        emit({ type: 'status', text: `Modelo saturado, reintentando en ${Math.ceil(waitSeconds)}s…` }),
    });

    if (assistantMsg.tool_calls?.length) {
      messages.push(assistantMsg);
      for (const call of assistantMsg.tool_calls) {
        const name = call.function.name;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        // Compuerta de confirmación en código: solo un envío explícito del
        // formulario de transferencia habilita transfer_funds, sin importar
        // lo que el modelo haya puesto en los argumentos.
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
        emit({ type: 'tool_result', name, preview: resultText.slice(0, 220) });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: resultText,
        });
      }
      emit({ type: 'status', text: 'Generando tu interfaz...' });
      continue;
    }

    const parsed = parseUiJson(assistantMsg.content);
    if (parsed) {
      emit({ type: 'ui', message: parsed.message, ui: parsed.ui });
      return parsed;
    }

    // Reintento de reparación: pedir solo el JSON.
    messages.push(assistantMsg);
    messages.push({
      role: 'user',
      content: 'Tu respuesta no fue JSON válido. Responde ÚNICAMENTE con el objeto JSON {"message":"...","ui":[...]} sin ningún texto adicional.',
    });
  }

  const fallback = {
    message: 'No pude generar la interfaz en este momento. Intenta reformular tu solicitud.',
    ui: [{ type: 'alert', level: 'error', text: 'El agente no produjo una respuesta válida tras varios intentos.' }],
  };
  emit({ type: 'ui', ...fallback });
  return fallback;
}

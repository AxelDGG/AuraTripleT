// Proveedor LLM: Gemini (API nativa `generateContent` con function calling).
//
// El agente habla el formato de mensajes de OpenAI (es lo que produce Groq y lo
// que los tests conocen); aquí se traduce en los dos sentidos:
//   system            → systemInstruction
//   user              → contents[role:user]
//   assistant         → contents[role:model] (texto y/o functionCall)
//   tool              → contents[role:user] con functionResponse (varias en un turno)
// y la respuesta vuelve como {role:'assistant', content, tool_calls}.
//
// Gemini 3.x firma sus llamadas a función (`thoughtSignature`) y exige que el
// turno del modelo se le devuelva tal cual en la siguiente ronda. Por eso el
// mensaje del asistente conserva las partes originales en `_gemini.parts` y se
// reproducen íntegras en vez de reconstruirlas desde `tool_calls`.
//
// Por qué existe además de Groq: el tier gratis de Gemini se mide en requests
// por día y no en tokens por minuto (8k en Groq on-demand), así que un turno
// con tools (~5k tokens) no lo satura. Ojo con cuál: el cupo diario cambia
// muchísimo entre modelos (gemini-3.6-flash da 20 requests/día en el tier
// gratis, gemini-2.5-flash cientos) y cada turno del agente gasta dos.

export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const MAX_RATE_LIMIT_RETRIES = 4;
const MAX_RATE_LIMIT_WAIT_SECONDS = 60;
const DEFAULT_RETRY_WAIT_SECONDS = 10;
// 503 UNAVAILABLE ("high demand") es del lado de Google y suele durar segundos.
const OVERLOADED_WAIT_SECONDS = 2;
const TIMEOUT_MS = 90_000;
const TEMPERATURE = 0.3;
// Incluye los tokens de razonamiento del modelo: corto y se trunca el JSON.
const MAX_OUTPUT_TOKENS = 8192;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------- esquemas de tools ----------
//
// Gemini acepta un subconjunto de OpenAPI: sin `$schema`, sin
// `additionalProperties`, sin `type: ["string","null"]` (se vuelve `nullable`).
const SCHEMA_KEYS = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'nullable', 'minimum', 'maximum', 'format']);
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

export function sanitizeSchema(schema, depth = 0) {
  if (!isObject(schema) || depth > 12) return { type: 'object', properties: {} };
  let out = {};
  let nullable = schema.nullable === true;

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((t) => t !== 'null');
    if (types.length !== schema.type.length) nullable = true;
    out.type = types[0] ?? 'string';
  } else if (typeof schema.type === 'string') {
    out.type = schema.type;
  }

  // anyOf/oneOf con null → nullable del primer tipo concreto.
  const variants = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(variants)) {
    const concrete = variants.filter((v) => !(isObject(v) && v.type === 'null'));
    if (concrete.length !== variants.length) nullable = true;
    if (concrete[0]) out = { ...sanitizeSchema(concrete[0], depth + 1), ...out };
  }

  for (const [key, value] of Object.entries(schema)) {
    if (!SCHEMA_KEYS.has(key) || key === 'type' || key === 'nullable') continue;
    if (key === 'properties' && isObject(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, prop]) => [name, sanitizeSchema(prop, depth + 1)]));
    } else if (key === 'items') {
      out.items = sanitizeSchema(value, depth + 1);
    } else if (key === 'format') {
      // Gemini solo acepta unos cuantos formatos; los demás se descartan.
      if (['enum', 'date-time', 'int32', 'int64', 'float', 'double'].includes(value)) out.format = value;
    } else {
      out[key] = value;
    }
  }
  if (!TYPES.has(out.type)) out.type = out.properties ? 'object' : 'string';
  if (out.type === 'object' && !out.properties) out.properties = {};
  if (nullable) out.nullable = true;
  return out;
}

// ---------- OpenAI → Gemini ----------

function parseArgs(text) {
  try {
    const parsed = JSON.parse(text || '{}');
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// El resultado de una tool debe ser un objeto JSON.
function toolResponse(content) {
  try {
    const parsed = JSON.parse(content);
    return isObject(parsed) ? parsed : { result: parsed };
  } catch {
    return { result: String(content ?? '') };
  }
}

// Gemini 3.x regula el razonamiento con `thinkingLevel`; 2.5 solo entiende
// `thinkingBudget` en tokens y responde 400 si le llega el nivel. Se traduce
// aquí para que cambiar GEMINI_MODEL no rompa el turno.
const THINKING_BUDGET = { off: 0, none: 0, minimal: 0, low: 512, medium: 4096, high: 12288 };

export function thinkingConfig(model, level) {
  if (/^gemini-3/.test(model)) return { thinkingLevel: level };
  return { thinkingBudget: THINKING_BUDGET[level] ?? THINKING_BUDGET.low };
}

export function toGeminiRequest({ messages, tools, model = GEMINI_DEFAULT_MODEL }) {
  const system = [];
  const contents = [];
  let pendingResponses = null;

  const flushResponses = () => {
    if (pendingResponses) contents.push({ role: 'user', parts: pendingResponses });
    pendingResponses = null;
  };

  for (const message of messages) {
    if (message.role === 'system') {
      system.push(String(message.content ?? ''));
      continue;
    }
    if (message.role === 'tool') {
      pendingResponses ??= [];
      pendingResponses.push({
        functionResponse: {
          ...(message.tool_call_id ? { id: message.tool_call_id } : {}),
          name: message.name,
          response: toolResponse(message.content),
        },
      });
      continue;
    }
    flushResponses();
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: String(message.content ?? '') }] });
      continue;
    }
    if (message.role === 'assistant') {
      if (Array.isArray(message._gemini?.parts) && message._gemini.parts.length) {
        contents.push({ role: 'model', parts: message._gemini.parts });
        continue;
      }
      const parts = [];
      if (message.content) parts.push({ text: String(message.content) });
      for (const call of message.tool_calls ?? []) {
        parts.push({ functionCall: { ...(call.id ? { id: call.id } : {}), name: call.function.name, args: parseArgs(call.function.arguments) } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
    }
  }
  flushResponses();

  const request = {
    contents,
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Medido: con el razonamiento por defecto la ronda final gastaba ~2,300
      // tokens pensando (13 s) para escribir ~1,000 de JSON. La tarea ya viene
      // guiada por el prompt y los datos de las tools; "low" recorta la espera.
      thinkingConfig: thinkingConfig(model, process.env.GEMINI_THINKING_LEVEL || 'low'),
    },
  };
  if (system.length) request.systemInstruction = { parts: [{ text: system.join('\n\n') }] };
  if (Array.isArray(tools) && tools.length) {
    request.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description ?? '',
        parameters: sanitizeSchema(t.function.parameters ?? { type: 'object', properties: {} }),
      })),
    }];
  }
  return request;
}

// ---------- Gemini → OpenAI ----------

export function fromGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason ?? 'sin candidatos';
    throw new Error(`Gemini no devolvió respuesta (${reason}).`);
  }
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  const toolCalls = parts
    .filter((p) => isObject(p.functionCall))
    .map((p, index) => ({
      id: p.functionCall.id ?? `call_${index + 1}`,
      type: 'function',
      function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
    }));
  const message = { role: 'assistant', content: text || null, _gemini: { parts } };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return message;
}

// El 429 por cupo diario trae un retryDelay corto (13 s) que no sirve de nada:
// esperarlo solo repite el error hasta agotar los reintentos. Se reconoce por
// el quotaId de la violación (…PerDayPerProject…).
function isDailyQuota(body) {
  return /PerDay/i.test(body) || /per day/i.test(body);
}

// "retryDelay": "23s" en el error 429; si no viene, 10 s.
function parseRetryAfterSeconds(body) {
  const match = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) ?? body.match(/retry in ([\d.]+)s/i);
  return match ? parseFloat(match[1]) + 1 : DEFAULT_RETRY_WAIT_SECONDS;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Gemini API: tiempo de espera agotado (${timeoutMs / 1000}s).`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `fetchImpl` y `sleep` son inyectables para probar sin red ni esperas.
export function createGeminiProvider({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
  baseUrl = process.env.GEMINI_BASE_URL || GEMINI_BASE_URL,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
} = {}) {
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY en .env');
  const url = `${baseUrl}/models/${model}:generateContent`;

  async function chat({ messages, tools, onRateLimit }) {
    const body = JSON.stringify(toGeminiRequest({ messages, tools, model }));
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const res = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
      }, TIMEOUT_MS);

      if (res.status === 429) {
        const errorBody = await res.text();
        // Sin cupo diario no hay reintento que valga: mejor decirlo que dejar
        // la pantalla en "Modelo saturado, reintentando…" durante un minuto.
        if (isDailyQuota(errorBody)) {
          throw new Error(
            `Gemini: cupo diario gratis de ${model} agotado; cambia GEMINI_MODEL (p. ej. gemini-2.5-flash), usa otra API key o LLM_PROVIDER=groq.`,
          );
        }
        const waitSeconds = parseRetryAfterSeconds(errorBody);
        if (attempt >= MAX_RATE_LIMIT_RETRIES || waitSeconds > MAX_RATE_LIMIT_WAIT_SECONDS) {
          throw new Error(`Gemini: límite de cuota; vuelve a intentar en ~${Math.ceil(waitSeconds / 60)} min.`);
        }
        onRateLimit?.(waitSeconds, attempt + 1);
        await sleep(waitSeconds * 1000);
        continue;
      }
      // El modelo saturado del lado de Google: sin esto un pico de segundos
      // tumba el turno entero con un 503 crudo.
      if (res.status === 503 && attempt < MAX_RATE_LIMIT_RETRIES) {
        await res.text();
        const waitSeconds = OVERLOADED_WAIT_SECONDS * (attempt + 1);
        onRateLimit?.(waitSeconds, attempt + 1);
        await sleep(waitSeconds * 1000);
        continue;
      }
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Gemini API ${res.status}: ${errorBody.slice(0, 500)}`);
      }
      return fromGeminiResponse(await res.json());
    }
    throw new Error('Gemini API: límite de cuota persistente tras varios reintentos.');
  }

  return { name: 'gemini', model, chat };
}

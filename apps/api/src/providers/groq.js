// Proveedor LLM: Groq (API compatible con OpenAI, con tool calling).
// Encapsula reintentos por rate limit, timeout y la recuperación de la UI
// cuando gpt-oss emite el JSON final como una tool call inexistente ("json").

import { parseUiJson } from '../ui-spec.js';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';

const MAX_RATE_LIMIT_RETRIES = 4;
// Tope para esperar a que se libere el límite por minuto antes de rendirse.
const MAX_RATE_LIMIT_WAIT_SECONDS = 90;
const DEFAULT_RETRY_WAIT_SECONDS = 8;
const TIMEOUT_MS = 60_000;
const TEMPERATURE = 0.3;
const MAX_TOKENS = 2500;

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

// Groq responde 400 con `failed_generation` cuando el modelo llamó a una tool
// que no existe. Si ese texto contiene la UI en JSON, se rescata.
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

// "try again in 4.2s" → 5 · "try again in 29m38.5s" → 1779. Sin dato, 8 s.
function parseRetryAfterSeconds(body) {
  const match = body.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  if (!match) return DEFAULT_RETRY_WAIT_SECONDS;
  return Number(match[1] ?? 0) * 60 + parseFloat(match[2]) + 1;
}

// Una espera de minutos (límite diario agotado) no se reintenta: se avisa con
// claridad para que la demo no se quede "reintentando" medio minuto en vano.
function rateLimitError(body, waitSeconds) {
  const daily = /tokens per day/i.test(body);
  const minutes = Math.ceil(waitSeconds / 60);
  return new Error(
    daily
      ? `Groq: límite diario de tokens agotado; vuelve a intentar en ~${minutes} min o usa otra API key (Dev Tier).`
      : `Groq: límite de velocidad; vuelve a intentar en ~${minutes} min.`,
  );
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Groq API: tiempo de espera agotado (${timeoutMs / 1000}s).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `fetchImpl` y `sleep` son inyectables para probar reintentos sin red ni esperas.
export function createGroqProvider({
  apiKey = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
} = {}) {
  if (!apiKey) throw new Error('Falta GROQ_API_KEY en .env');

  async function chat({ messages, tools, onRateLimit }) {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const res = await fetchWithTimeout(fetchImpl, GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          // Sin herramientas (p.ej. la extracción de memoria) no se manda
          // tool_choice: Groq lo rechaza si no hay tools que elegir.
          ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: 'auto' } : {}),
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
        }),
      }, TIMEOUT_MS);

      if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const body = await res.text();
        const waitSeconds = parseRetryAfterSeconds(body);
        // El límite por minuto (TPM) se libera solo: vale la pena esperar hasta
        // un minuto. El diario o una espera de minutos, no.
        if (/tokens per day/i.test(body) || waitSeconds > MAX_RATE_LIMIT_WAIT_SECONDS) throw rateLimitError(body, waitSeconds);
        onRateLimit?.(waitSeconds, attempt + 1);
        await sleep(waitSeconds * 1000);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        const recovered = extractFailedGeneration(body);
        if (res.status === 400 && recovered) return { role: 'assistant', content: recovered };
        throw new Error(`Groq API ${res.status}: ${body.slice(0, 500)}`);
      }
      const data = await res.json();
      return data.choices[0].message;
    }
    throw new Error('Groq API: límite de velocidad persistente tras varios reintentos.');
  }

  return { name: 'groq', model, chat };
}

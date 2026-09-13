// Extracción de memoria: qué vale la pena recordar de un turno.
//
// Al cerrar cada turno, un LLM lee lo que dijo la persona y lo que respondió
// Norte y devuelve hasta tres hechos DURADEROS (preferencias, metas, contexto,
// decisiones). Saldos, cifras del momento y datos que ya están en el banco no
// se guardan: la memoria es para personalizar, no para duplicar la base.
//
// Corre por defecto con Gemini si hay key (su tier se mide por requests al día
// y no come el presupuesto de tokens por minuto de Groq); si no, con el
// proveedor que orquesta. Es best-effort: cualquier fallo se registra y el
// turno termina igual.

import { getLlmProvider } from '../providers/index.js';
import { GROQ_DEFAULT_MODEL } from '../providers/groq.js';

export const MEMORY_KINDS = new Set(['fact', 'preference', 'goal', 'context']);
const MAX_FACTS = 3;
const MAX_CONTENT_CHARS = 160;
const MAX_TURN_CHARS = 1500;

const SYSTEM_PROMPT = `Eres la memoria de largo plazo de "Norte", el asistente bancario de Banorte. Lees un intercambio y extraes SOLO hechos duraderos sobre la persona que sirvan para personalizar conversaciones futuras:
- preference: cómo le gusta ver o decidir las cosas (plazos cortos, cuenta favorita, prefiere gráficas, quiere avisos).
- goal: metas o planes (ahorrar para un viaje en diciembre, liquidar la tarjeta).
- context: su vida y relaciones (Ana es su casera, paga renta el día 1, tiene un hijo en la universidad).
- fact: decisiones tomadas con efecto futuro (reestructuró la tarjeta a 12 meses).
NO guardes: saldos, montos o cifras del momento, datos que ya están en el banco (cuentas, beneficiarios), acciones sin consecuencia futura ("consultó sus gastos"), ni nada que ya esté en la lista de lo conocido.
Responde ÚNICAMENTE con JSON: {"facts":[{"kind":"preference|goal|context|fact","content":"<una frase en tercera persona, español, máximo 120 caracteres>"}]}. Máximo ${MAX_FACTS} hechos. Si no hay nada nuevo que valga la pena: {"facts":[]}.`;

// El modelo a veces envuelve el JSON en ``` o le antepone texto: se rescata el
// primer objeto con "facts".
export function parseFacts(text) {
  if (typeof text !== 'string') return [];
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  const facts = Array.isArray(parsed?.facts) ? parsed.facts : [];
  const seen = new Set();
  const out = [];
  for (const fact of facts) {
    const content = typeof fact?.content === 'string' ? fact.content.trim().slice(0, MAX_CONTENT_CHARS) : '';
    if (!content) continue;
    const key = content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: MEMORY_KINDS.has(fact.kind) ? fact.kind : 'fact', content });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

export function defaultMemoryProviderName() {
  if (process.env.MEMORY_LLM_PROVIDER) return process.env.MEMORY_LLM_PROVIDER;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return process.env.LLM_PROVIDER || 'groq';
}

// En Groq el límite de tokens por minuto es por modelo: si la memoria corre en
// el mismo que orquesta, cada turno gasta dos veces del mismo cupo y el turno
// siguiente se topa con un 429. Por eso, cuando memoria y orquestador
// coincidirían en Groq, la extracción se va a un modelo más chico (su propio
// presupuesto). MEMORY_LLM_MODEL lo fija a mano.
export const MEMORY_GROQ_FALLBACK_MODEL = 'openai/gpt-oss-20b';

export function defaultMemoryModel(providerName = defaultMemoryProviderName()) {
  if (process.env.MEMORY_LLM_MODEL) return process.env.MEMORY_LLM_MODEL;
  if (providerName !== 'groq') return undefined;
  const orchestrator = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  // Solo se desvía si chocaría con el orquestador; si ya son distintos, se
  // respeta lo que diga la configuración.
  if ((process.env.LLM_PROVIDER || 'groq') !== 'groq') return undefined;
  return orchestrator === MEMORY_GROQ_FALLBACK_MODEL ? undefined : MEMORY_GROQ_FALLBACK_MODEL;
}

export function createMemoryExtractor({
  provider,
  providerName = defaultMemoryProviderName(),
  model = defaultMemoryModel(providerName),
  logger = console.warn,
} = {}) {
  let resolved = provider ?? null;
  let disabled = false;

  // El proveedor se resuelve en el primer uso: si falta su key, la memoria se
  // desactiva con un aviso y la API sigue arrancando.
  const getProvider = () => {
    if (resolved || disabled) return resolved;
    try {
      resolved = getLlmProvider(providerName, model ? { model } : {});
    } catch (err) {
      disabled = true;
      logger(`[memoria] extracción desactivada: ${err.message}`);
    }
    return resolved;
  };

  async function extract({ userMessage, assistantMessage, known = [] }) {
    const llm = getProvider();
    if (!llm) return [];
    const knownList = known.length ? `\nYa se sabe (no lo repitas):\n${known.map((k) => `- ${k}`).join('\n')}` : '';
    const reply = await llm.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + knownList },
        {
          role: 'user',
          content: `PERSONA: ${String(userMessage ?? '').slice(0, MAX_TURN_CHARS)}\nNORTE: ${String(assistantMessage ?? '').slice(0, MAX_TURN_CHARS)}`,
        },
      ],
    });
    const facts = parseFacts(reply?.content);
    const knownKeys = new Set(known.map((k) => k.toLowerCase()));
    return facts.filter((f) => !knownKeys.has(f.content.toLowerCase()));
  }

  return { name: providerName, model, extract };
}

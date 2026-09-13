// Selección del proveedor LLM que orquesta al agente.
// Contrato de un proveedor: { name, model, chat({ messages, tools, onRateLimit }) → mensaje del
// asistente en formato OpenAI (content o tool_calls) }.
//
// Groq (gpt-oss-120b) es el más rápido; Gemini (gemini-3.6-flash) tiene un tier
// gratis medido en requests por día y no en tokens por minuto, así que aguanta
// una demo con varios turnos seguidos. Se elige con LLM_PROVIDER.

import { createGroqProvider } from './groq.js';
import { createGeminiProvider } from './gemini.js';

const FACTORIES = {
  groq: createGroqProvider,
  gemini: createGeminiProvider,
};

export const DEFAULT_PROVIDER = 'groq';

export function availableProviders() {
  return Object.keys(FACTORIES);
}

// `options` permite pedir el mismo proveedor con otro modelo (p. ej. la
// extracción de memoria en un modelo distinto al del orquestador: en Groq el
// límite de tokens por minuto es por modelo, así que no compiten entre sí).
export function getLlmProvider(name = process.env.LLM_PROVIDER || DEFAULT_PROVIDER, options = {}) {
  const factory = FACTORIES[name];
  if (!factory) {
    throw new Error(`LLM_PROVIDER desconocido: "${name}". Opciones: ${availableProviders().join(', ')}.`);
  }
  return factory(options);
}

// Selección del proveedor LLM que orquesta al agente.
// Contrato de un proveedor: { name, model, chat({ messages, tools, onRateLimit }) → mensaje del
// asistente en formato OpenAI (content o tool_calls) }.
// Groq es el orquestador por defecto; Gemini se agrega aquí como fallback (LLM_PROVIDER=gemini).

import { createGroqProvider } from './groq.js';

const FACTORIES = {
  groq: createGroqProvider,
};

export const DEFAULT_PROVIDER = 'groq';

export function availableProviders() {
  return Object.keys(FACTORIES);
}

export function getLlmProvider(name = process.env.LLM_PROVIDER || DEFAULT_PROVIDER) {
  const factory = FACTORIES[name];
  if (!factory) {
    throw new Error(`LLM_PROVIDER desconocido: "${name}". Opciones: ${availableProviders().join(', ')}.`);
  }
  return factory();
}

// Extrae el JSON que devuelve el modelo y lo normaliza con el contrato.
// Tolera fences de markdown y texto alrededor del JSON.
//
// `parseAgentReply` es la entrada de Norte A2UI v2: devuelve una superficie
// (árbol aplanado + dataModel) o un patch sobre la superficie activa.
// `parseUiJson` es la entrada v1 (arreglo plano de `type`) y se conserva para
// el historial viejo y los tests del contrato v1.

import { normalizeAgentReply, normalizeUiSpec } from '@norte/a2ui-schema';

export function extractJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseUiJson(raw) {
  const parsed = extractJson(raw);
  return parsed ? normalizeUiSpec(parsed) : null;
}

// Superficie o patch. `activeSurfaceId` es la superficie que el cliente tiene
// en pantalla: solo sobre ella se acepta un patch.
export function parseAgentReply(raw, { activeSurfaceId, surfaceId } = {}) {
  const parsed = extractJson(raw);
  if (!parsed) return null;
  // Una respuesta sin interfaz ni actualizaciones no es una respuesta del agente.
  if (!('ui' in parsed) && !('updates' in parsed) && !('dataModelUpdates' in parsed)) {
    if (typeof parsed.message !== 'string') return null;
  }
  return normalizeAgentReply(parsed, { activeSurfaceId, surfaceId });
}

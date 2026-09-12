// Extrae el envelope {message, ui} del texto que devuelve el modelo y lo
// normaliza con el contrato Norte UI Spec. Tolera fences de markdown y texto
// alrededor del JSON.

import { normalizeUiSpec } from '@norte/a2ui-schema';

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
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return normalizeUiSpec(parsed);
  } catch {
    return null;
  }
}

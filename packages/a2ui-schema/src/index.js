// @norte/a2ui-schema — Norte UI Spec v1 (legado) y Norte A2UI v2 (protocolo).
// Contrato compartido entre el agente (lo emite), la API (lo normaliza) y los
// clientes web/mobile (lo renderizan con componentes propios).

import { componentSchemas } from './schemas.js';
import { DEFAULT_FOLDER, normalizeFolder } from './folders.js';

export {
  CHART_GUIDE,
  COMPONENT_CATALOG,
  COMPONENT_TYPES,
  SPEC_VERSION,
  chartsPromptSection,
  chartsPromptSectionCompact,
  componentsPromptSection,
} from './catalog.js';
export {
  DEFAULT_FOLDER,
  FOLDERS,
  FOLDER_IDS,
  folderLabel,
  foldersPromptSection,
  normalizeFolder,
} from './folders.js';
export {
  ACCOUNT_KINDS,
  ALERT_LEVELS,
  CHART_TYPES,
  INPUT_TYPES,
  TRENDS,
  componentSchemas,
} from './schemas.js';

// ---------- Norte A2UI v2 ----------
// Núcleo sin dependencias (runtime, bindings, catálogo, aplanado, compat) y los
// mensajes del protocolo validados con zod. Ver docs/A2UI.md.
export * from './core/index.js';
export {
  ClientCapabilitiesSchema,
  ComponentSchema,
  CreateSurfaceSchema,
  DeleteSurfaceSchema,
  MESSAGE_KINDS,
  UpdateComponentsSchema,
  UpdateDataModelSchema,
  UserActionSchema,
  makeMessage,
  newSurfaceId,
  normalizeAgentReply,
  parseClientCapabilities,
  parseMessage,
  parseUserAction,
} from './messages.js';

export function isKnownComponentType(type) {
  return Object.prototype.hasOwnProperty.call(componentSchemas, type);
}

// Lleva un componente a su forma canónica; null si no es un componente válido.
export function normalizeComponent(component) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) return null;
  if (!isKnownComponentType(component.type)) return null;
  const result = componentSchemas[component.type].safeParse(component);
  return result.success ? result.data : null;
}

const TITLE_MAX = 80;

// Título del historial. El modelo debería mandarlo; si no, se deduce de la
// interfaz (el encabezado o el título del primer componente que tenga uno) y,
// como último recurso, de la primera frase del mensaje.
function deriveTitle(input, ui, message) {
  const candidates = [
    input?.title,
    ui.find((c) => c.type === 'header')?.title,
    ui.find((c) => typeof c.title === 'string' && c.title)?.title,
    message.split(/(?<=[.!?])\s/)[0],
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    if (text) return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
  }
  return 'Visualización';
}

// Envelope completo {message, ui, folder, title}. Nunca lanza: lo que no se
// entiende se descarta y los campos del historial siempre quedan poblados.
export function normalizeUiSpec(input) {
  const message = typeof input?.message === 'string' ? input.message : '';
  const ui = Array.isArray(input?.ui) ? input.ui.map(normalizeComponent).filter(Boolean) : [];
  return {
    message,
    ui,
    folder: normalizeFolder(input?.folder ?? DEFAULT_FOLDER),
    title: deriveTitle(input, ui, message),
  };
}

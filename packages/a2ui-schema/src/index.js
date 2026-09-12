// @norte/a2ui-schema — Norte UI Spec v1, nuestro equivalente de A2UI.
// Contrato compartido entre el agente (lo emite), la API (lo normaliza) y los
// clientes web/mobile (lo renderizan con componentes propios).

import { componentSchemas } from './schemas.js';

export { COMPONENT_CATALOG, COMPONENT_TYPES, SPEC_VERSION, componentsPromptSection } from './catalog.js';
export {
  ACCOUNT_KINDS,
  ALERT_LEVELS,
  CHART_TYPES,
  INPUT_TYPES,
  TRENDS,
  componentSchemas,
} from './schemas.js';

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

// Envelope completo {message, ui}. Nunca lanza: lo que no se entiende se descarta.
export function normalizeUiSpec(input) {
  const message = typeof input?.message === 'string' ? input.message : '';
  const ui = Array.isArray(input?.ui) ? input.ui.map(normalizeComponent).filter(Boolean) : [];
  return { message, ui };
}

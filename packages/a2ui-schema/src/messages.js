// Mensajes del protocolo A2UI v1.0 (zod) y el sobre que emite el agente.
//
// Solo se usa en el servidor: valida lo que sale hacia los clientes y lo que
// vuelve de ellos (acciones). Los esquemas son tolerantes en el mismo espíritu
// que los de v1: lo que no se entiende se descarta, nunca se lanza.

import { z } from 'zod';
import { containsBinding } from './core/binding.js';
import { A2UI_VERSION, CATALOG_ID, ROOT_ID, canonicalComponentName } from './core/catalog-v2.js';
import { flattenTree } from './core/flatten.js';
import { isValidPointer } from './core/pointer.js';
import { toV1Components } from './core/compat.js';
import { DEFAULT_FOLDER, normalizeFolder } from './folders.js';
import { AccountCardSchema, KpiItemSchema, componentSchemas } from './schemas.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---------- normalización de la parte literal ----------
//
// Los componentes de dominio comparten campos con sus equivalentes v1, así que
// los esquemas zod de v1 (enums acotados, números coaccionados, alias del
// modelo) se les aplican tal cual cuando no traen bindings. Con bindings el
// valor solo existe en el cliente, y ahí los renderers ya son defensivos.
const V2_TO_V1_SCHEMA = {
  Header: 'header',
  Chart: 'chart',
  Table: 'table',
  TransactionList: 'transaction_list',
  Form: 'form',
  Alert: 'alert',
  Progress: 'progress',
  Text: 'text',
};

function normalizeLiteralComponent(component) {
  if (containsBinding(component)) return component;
  const { id, component: name, catalogId, children, child, ...props } = component;
  const keep = { id, component: name, ...(catalogId ? { catalogId } : {}), ...(children !== undefined ? { children } : {}), ...(child !== undefined ? { child } : {}) };
  if (V2_TO_V1_SCHEMA[name]) {
    const result = componentSchemas[V2_TO_V1_SCHEMA[name]].safeParse({ type: V2_TO_V1_SCHEMA[name], ...props });
    if (!result.success) return component;
    const { type, ...normalized } = result.data;
    return { ...keep, ...normalized };
  }
  if (name === 'Kpi') {
    const result = KpiItemSchema.safeParse(props);
    return result.success ? { ...keep, ...result.data } : component;
  }
  if (name === 'AccountCard') {
    const result = AccountCardSchema.safeParse(props);
    return result.success ? { ...keep, ...result.data } : component;
  }
  return component;
}

// Proyección v1 pasada por el contrato v1 completo.
function normalizeV1(ui) {
  return ui
    .map((c) => componentSchemas[c?.type]?.safeParse(c))
    .filter((r) => r?.success)
    .map((r) => r.data);
}

// ---------- componentes ----------

// Componente plano: id + nombre canónico; el resto de props pasa tal cual (los
// bindings se resuelven en el cliente, así que aquí no se pueden validar).
export const ComponentSchema = z.preprocess(
  (raw) => {
    if (!isObject(raw)) return raw;
    const name = canonicalComponentName(raw.component ?? raw.type);
    if (!name) return raw;
    const copy = { ...raw, component: name };
    if (!('component' in raw)) delete copy.type;
    return copy;
  },
  z.object({ id: z.string().min(1), component: z.string().min(1) }).passthrough(),
);

const componentList = z.preprocess(
  (value) => (Array.isArray(value) ? value : []),
  z.array(z.any()).transform((items) => items.map((c) => ComponentSchema.safeParse(c)).filter((r) => r.success).map((r) => r.data)),
);

const pointer = z.string().refine(isValidPointer, { message: 'JSON Pointer inválido' });
const dataModel = z.preprocess((v) => (isObject(v) ? v : {}), z.record(z.any()));

// ---------- mensajes agente → cliente ----------

export const CreateSurfaceSchema = z
  .object({
    surfaceId: z.string().min(1),
    catalogId: z.string().default(CATALOG_ID),
    sendDataModel: z.boolean().default(true),
    components: componentList.default([]),
    dataModel: dataModel.default({}),
  })
  .passthrough();

export const UpdateComponentsSchema = z
  .object({ surfaceId: z.string().min(1), components: componentList })
  .passthrough();

export const UpdateDataModelSchema = z
  .object({ surfaceId: z.string().min(1), path: pointer.default(''), value: z.any() })
  .passthrough();

export const DeleteSurfaceSchema = z.object({ surfaceId: z.string().min(1) }).passthrough();

const MESSAGE_SCHEMAS = {
  createSurface: CreateSurfaceSchema,
  updateComponents: UpdateComponentsSchema,
  updateDataModel: UpdateDataModelSchema,
  deleteSurface: DeleteSurfaceSchema,
};

export const MESSAGE_KINDS = Object.keys(MESSAGE_SCHEMAS);

// Construye un envelope válido {version, <kind>: payload}; null si no valida.
export function makeMessage(kind, payload) {
  const schema = MESSAGE_SCHEMAS[kind];
  if (!schema) return null;
  const result = schema.safeParse(payload);
  return result.success ? { version: A2UI_VERSION, [kind]: result.data } : null;
}

// Valida un envelope entrante y lo devuelve canónico, o null.
export function parseMessage(message) {
  if (!isObject(message)) return null;
  for (const kind of MESSAGE_KINDS) {
    if (isObject(message[kind])) {
      const result = MESSAGE_SCHEMAS[kind].safeParse(message[kind]);
      return result.success ? { version: A2UI_VERSION, [kind]: result.data } : null;
    }
  }
  return null;
}

// ---------- mensajes cliente → agente ----------

// Una acción de la persona sobre la UI generada: el evento de un Button o el
// envío de un Form, con el contexto ya resuelto y (opcionalmente) el modelo.
export const UserActionSchema = z.object({
  surfaceId: z.string().min(1).max(120),
  event: z.object({
    name: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/, 'nombre de evento inválido'),
    context: z.preprocess((v) => (isObject(v) ? v : {}), z.record(z.any())),
  }),
  dataModel: dataModel.optional(),
});

export function parseUserAction(input) {
  const result = UserActionSchema.safeParse(input);
  return result.success ? result.data : null;
}

// Lo que un cliente anuncia que sabe pintar (negociación de capacidades).
export const ClientCapabilitiesSchema = z.object({
  catalogId: z.string().max(200).optional(),
  components: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((n) => typeof n === 'string') : []),
    z.array(z.string()).max(64),
  ).optional(),
  platform: z.enum(['web', 'mobile', 'widget']).optional(),
});

export function parseClientCapabilities(input) {
  if (!isObject(input)) return null;
  const result = ClientCapabilitiesSchema.safeParse(input);
  return result.success ? result.data : null;
}

// ---------- el sobre del agente ----------

const TITLE_MAX = 80;

function deriveTitle(input, components, message) {
  const find = (name) => components.find((c) => c.component === name && typeof c.title === 'string' && c.title.trim());
  const candidates = [
    input?.title,
    find('Header')?.title,
    components.find((c) => typeof c.title === 'string' && c.title.trim())?.title,
    String(message ?? '').split(/(?<=[.!?])\s/)[0],
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    if (text) return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
  }
  return 'Visualización';
}

let surfaceCounter = 0;
export function newSurfaceId() {
  surfaceCounter += 1;
  return `s_${Date.now().toString(36)}${surfaceCounter.toString(36)}`;
}

const UpdateEntry = z.object({ path: pointer, value: z.any() }).passthrough();

// Normaliza la respuesta del modelo a una de dos formas:
//   { kind: 'surface', message, title, folder, surface: {surfaceId, catalogId, components, dataModel}, ui }
//   { kind: 'patch',   message, title, folder, surfaceId, updates: [{path, value}] }
// `ui` es la proyección v1 (para clientes viejos y miniaturas). Nunca lanza.
export function normalizeAgentReply(input, { activeSurfaceId, surfaceId } = {}) {
  const message = typeof input?.message === 'string' ? input.message : '';
  const folder = normalizeFolder(input?.folder ?? DEFAULT_FOLDER);

  const rawUpdates = Array.isArray(input?.updates) ? input.updates : Array.isArray(input?.dataModelUpdates) ? input.dataModelUpdates : null;
  const wantsPatch = rawUpdates && !Array.isArray(input?.ui) && typeof input?.surfaceId === 'string';
  if (wantsPatch && activeSurfaceId && input.surfaceId === activeSurfaceId) {
    const updates = rawUpdates.map((u) => UpdateEntry.safeParse(u)).filter((r) => r.success).map((r) => r.data);
    if (updates.length) {
      return {
        kind: 'patch',
        message,
        folder,
        title: deriveTitle(input, [], message),
        surfaceId: activeSurfaceId,
        updates,
      };
    }
  }

  const tree = Array.isArray(input?.ui) ? input.ui : isObject(input?.ui) ? input.ui : [];
  const components = flattenTree(tree, { rootId: ROOT_ID }).components.map(normalizeLiteralComponent);
  const model = isObject(input?.dataModel) ? input.dataModel : {};
  const id = surfaceId ?? newSurfaceId();
  const surface = { surfaceId: id, catalogId: CATALOG_ID, sendDataModel: true, components, dataModel: model };
  return {
    kind: 'surface',
    message,
    folder,
    title: deriveTitle(input, components, message),
    surface,
    ui: normalizeV1(toV1Components(surface)),
  };
}

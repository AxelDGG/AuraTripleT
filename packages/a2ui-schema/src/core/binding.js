// Resolución de valores dinámicos de A2UI.
//
// Una propiedad de componente puede ser:
//   - un literal:              "text": "Hola"
//   - un binding por ruta:     "text": {"path": "/user/name"}
//   - una llamada a función:   "text": {"call": "currency", "args": {"v": {"path": "/saldo"}}}
//
// Las rutas son JSON Pointer absolutas ("/a/b") o relativas al `scope` actual
// ("amount" dentro de la fila /txs/3 → /txs/3/amount). Al resolver se anotan
// en `deps` las rutas leídas: el renderer las usa para saber qué componentes
// vuelven a pintarse cuando cambia el modelo.

import { RENDERER_FUNCTIONS, callRendererFunction } from './functions.js';
import { getAt, joinPointer } from './pointer.js';

const MAX_DEPTH = 24;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isPathBinding(value) {
  return isObject(value) && typeof value.path === 'string' && !('call' in value) && !('component' in value);
}

export function isCallBinding(value) {
  return isObject(value) && typeof value.call === 'string' && !('component' in value);
}

export function isBinding(value) {
  return isPathBinding(value) || isCallBinding(value);
}

// Propiedades que nunca se resuelven: son estructura, no datos.
export const STRUCTURAL_PROPS = new Set(['id', 'component', 'catalogId', 'children', 'child', 'action', 'template', 'items_template']);

// Comodín de lista: "/categorias/*/total" (o "[*]", como lo escriben los
// modelos) devuelve el campo de cada elemento. No es JSON Pointer estricto,
// pero es la forma natural de pedir las etiquetas de una gráfica; la
// alternativa canónica es {"call":"pluck",...}.
const WILDCARD_RE = /\/(\*|\[\*\])(?=\/|$)/;

function readPath(model, pointer, deps) {
  const match = WILDCARD_RE.exec(pointer);
  if (!match) {
    deps?.add(pointer);
    return getAt(model, pointer);
  }
  const head = pointer.slice(0, match.index);
  const tail = pointer.slice(match.index + match[0].length);
  deps?.add(head || '');
  const items = getAt(model, head);
  if (!Array.isArray(items)) return undefined;
  return items.map((item) => (tail ? readPath(item, tail) : item));
}

function resolveInner(value, ctx, depth) {
  if (depth > MAX_DEPTH) return value;
  if (isPathBinding(value)) {
    const pointer = joinPointer(ctx.scope, value.path);
    const found = readPath(ctx.model, pointer, ctx.deps);
    return found === undefined && 'default' in value ? resolveInner(value.default, ctx, depth + 1) : found;
  }
  if (isCallBinding(value)) {
    const args = {};
    for (const [key, arg] of Object.entries(value.args ?? {})) args[key] = resolveInner(arg, ctx, depth + 1);
    const result = callRendererFunction(value.call, args, ctx.functions);
    return result === undefined && 'default' in value ? resolveInner(value.default, ctx, depth + 1) : result;
  }
  if (Array.isArray(value)) return value.map((item) => resolveInner(item, ctx, depth + 1));
  if (isObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = resolveInner(item, ctx, depth + 1);
    return out;
  }
  return value;
}

// Resuelve un valor (literal, binding o estructura anidada con bindings).
export function resolveDynamic(value, { model = {}, scope = '', functions = RENDERER_FUNCTIONS, deps } = {}) {
  return resolveInner(value, { model, scope, functions, deps }, 0);
}

// Resuelve todas las propiedades de un componente menos las estructurales.
// Devuelve una copia con valores literales lista para el renderer.
export function resolveProps(component, ctx = {}) {
  if (!isObject(component)) return component;
  const out = {};
  for (const [key, value] of Object.entries(component)) {
    out[key] = STRUCTURAL_PROPS.has(key) ? value : resolveDynamic(value, ctx);
  }
  return out;
}

// Contexto de una acción (`event.context`): se resuelve al disparar, con el
// modelo de ese instante, para que el agente reciba lo que la persona ve.
export function resolveActionContext(context, ctx = {}) {
  return resolveDynamic(context ?? {}, ctx);
}

// ¿El valor (o algo dentro de él) contiene algún binding? Sirve para decidir
// si un componente puede normalizarse en el servidor o solo tras resolverse.
export function containsBinding(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (isBinding(value)) return true;
  if (Array.isArray(value)) return value.some((v) => containsBinding(v, depth + 1));
  if (isObject(value)) return Object.values(value).some((v) => containsBinding(v, depth + 1));
  return false;
}

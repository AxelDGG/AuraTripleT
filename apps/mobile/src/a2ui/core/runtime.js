// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Runtime de superficies A2UI: el estado que comparten el renderer web y el
// renderer nativo.
//
// Recibe los mensajes del protocolo (createSurface, updateComponents,
// updateDataModel, deleteSurface), mantiene por superficie la lista de
// componentes y el modelo de datos, y avisa a quien esté suscrito qué cambió y
// dónde. También resuelve bindings, aplica los cambios locales de los controles
// (un slider escribe en el modelo sin pasar por el agente) y arma el payload de
// una acción para mandarla de vuelta.
//
// Sin dependencias ni DOM: cada plataforma pone encima su registro de
// componentes.

import { resolveActionContext, resolveProps } from './binding.js';
import { A2UI_VERSION, CATALOG_ID, ROOT_ID, canonicalComponentName } from './catalog-v2.js';
import { childIds, isTemplatedChildren, orderFromRoot } from './flatten.js';
import { RENDERER_FUNCTIONS } from './functions.js';
import { getAt, isValidPointer, joinPointer, setAt } from './pointer.js';

const MESSAGE_KINDS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Acepta el envelope A2UI ({version, createSurface:{...}}) o un mensaje ya
// abierto ({kind, ...payload}). Devuelve {kind, payload} o null.
export function unwrapMessage(message) {
  if (!isObject(message)) return null;
  for (const kind of MESSAGE_KINDS) {
    if (isObject(message[kind])) return { kind, payload: message[kind] };
  }
  if (typeof message.kind === 'string' && MESSAGE_KINDS.includes(message.kind)) {
    const { kind, ...payload } = message;
    return { kind, payload };
  }
  return null;
}

export function wrapMessage(kind, payload) {
  return { version: A2UI_VERSION, [kind]: payload };
}

// Acciones locales que un Button puede ejecutar sin agente. Cerradas, como las
// renderer functions: el modelo elige una, nunca manda código.
export const LOCAL_ACTIONS = {
  setData: (store, surfaceId, { path, value }) => store.setData(surfaceId, path, value),
  toggle: (store, surfaceId, { path }) => store.setData(surfaceId, path, !store.getData(surfaceId, path)),
  increment: (store, surfaceId, { path, by = 1, min, max }) => {
    const current = Number(store.getData(surfaceId, path)) || 0;
    let next = current + (Number(by) || 1);
    if (min !== undefined) next = Math.max(Number(min), next);
    if (max !== undefined) next = Math.min(Number(max), next);
    store.setData(surfaceId, path, next);
  },
};

function normalizeComponent(raw) {
  if (!isObject(raw)) return null;
  const name = canonicalComponentName(raw.component ?? raw.type);
  if (!name || typeof raw.id !== 'string' || !raw.id) return null;
  const component = { ...raw, component: name };
  if (!('component' in raw)) delete component.type;
  return component;
}

export function createSurfaceStore({ functions = RENDERER_FUNCTIONS } = {}) {
  const surfaces = new Map();
  const listeners = new Set();

  const notify = (change) => {
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch (err) {
        // Un listener roto no debe frenar a los demás.
        if (typeof console !== 'undefined') console.error('[a2ui] listener', err);
      }
    }
  };

  const ensure = (surfaceId) => surfaces.get(surfaceId) ?? null;

  function createSurface(payload) {
    const surfaceId = String(payload.surfaceId ?? '');
    if (!surfaceId) return null;
    const components = new Map();
    for (const raw of Array.isArray(payload.components) ? payload.components : []) {
      const component = normalizeComponent(raw);
      if (component) components.set(component.id, component);
    }
    const surface = {
      surfaceId,
      catalogId: typeof payload.catalogId === 'string' ? payload.catalogId : CATALOG_ID,
      sendDataModel: payload.sendDataModel !== false,
      components,
      dataModel: isObject(payload.dataModel) ? payload.dataModel : {},
      version: 0,
      createdAt: Date.now(),
    };
    surfaces.set(surfaceId, surface);
    seedLiteralLists(surface);
    notify({ type: 'createSurface', surfaceId, componentIds: [...components.keys()] });
    return surface;
  }

  // List con itemsLiteral: la lista vive en el modelo bajo /__lists/<id> para
  // que el template la lea con rutas relativas igual que una lista del agente.
  function seedLiteralLists(surface) {
    for (const component of surface.components.values()) {
      if (component.component === 'List' && Array.isArray(component.itemsLiteral)) {
        surface.dataModel = setAt(surface.dataModel, `/__lists/${component.id}`, component.itemsLiteral);
      }
    }
  }

  function updateComponents(payload) {
    const surface = ensure(String(payload.surfaceId ?? ''));
    if (!surface) return null;
    const ids = [];
    for (const raw of Array.isArray(payload.components) ? payload.components : []) {
      const component = normalizeComponent(raw);
      if (!component) continue;
      surface.components.set(component.id, component);
      ids.push(component.id);
    }
    surface.version += 1;
    seedLiteralLists(surface);
    notify({ type: 'updateComponents', surfaceId: surface.surfaceId, componentIds: ids });
    return surface;
  }

  function updateDataModel(payload) {
    const surface = ensure(String(payload.surfaceId ?? ''));
    if (!surface) return null;
    const path = payload.path === undefined || payload.path === null ? '' : String(payload.path);
    if (!isValidPointer(path)) return null;
    const value = payload.value;
    surface.dataModel = path === '' || path === '/'
      ? (isObject(value) ? value : {})
      : setAt(surface.dataModel, path, value);
    surface.version += 1;
    notify({ type: 'updateDataModel', surfaceId: surface.surfaceId, path: path === '/' ? '' : path, source: 'agent' });
    return surface;
  }

  function deleteSurface(payload) {
    const surfaceId = String(payload.surfaceId ?? '');
    if (!surfaces.delete(surfaceId)) return null;
    notify({ type: 'deleteSurface', surfaceId });
    return surfaceId;
  }

  const store = {
    // ---------- protocolo ----------
    apply(message) {
      const unwrapped = unwrapMessage(message);
      if (!unwrapped) return null;
      const { kind, payload } = unwrapped;
      if (kind === 'createSurface') return createSurface(payload);
      if (kind === 'updateComponents') return updateComponents(payload);
      if (kind === 'updateDataModel') return updateDataModel(payload);
      if (kind === 'deleteSurface') return deleteSurface(payload);
      return null;
    },

    // ---------- lectura ----------
    has: (surfaceId) => surfaces.has(surfaceId),
    get: (surfaceId) => ensure(surfaceId),
    list: () => [...surfaces.keys()],
    getComponent(surfaceId, id) {
      return ensure(surfaceId)?.components.get(id) ?? null;
    },
    getData(surfaceId, path) {
      const surface = ensure(surfaceId);
      return surface ? getAt(surface.dataModel, path ?? '') : undefined;
    },
    // Copia plana para persistir o mandar: {surfaceId, catalogId, components[], dataModel}.
    snapshot(surfaceId) {
      const surface = ensure(surfaceId);
      if (!surface) return null;
      return {
        surfaceId: surface.surfaceId,
        catalogId: surface.catalogId,
        sendDataModel: surface.sendDataModel,
        components: orderFromRoot([...surface.components.values()]),
        dataModel: surface.dataModel,
      };
    },
    rootId: () => ROOT_ID,
    childIds,
    isTemplatedChildren,

    // Props resueltas de un componente en un scope. `deps` recibe las rutas leídas.
    resolve(surfaceId, component, { scope = '', deps } = {}) {
      const surface = ensure(surfaceId);
      return resolveProps(component, { model: surface?.dataModel ?? {}, scope, functions, deps });
    },
    // Filas de un List: [{scope, index}] a partir de children {path, componentId}.
    listRows(surfaceId, component, { scope = '' } = {}) {
      const surface = ensure(surfaceId);
      if (!surface || !isTemplatedChildren(component.children)) return [];
      const pointer = joinPointer(scope, component.children.path);
      const items = getAt(surface.dataModel, pointer);
      if (!Array.isArray(items)) return [];
      return items.map((_, index) => ({ scope: `${pointer}/${index}`, index, componentId: component.children.componentId }));
    },

    // ---------- cambios locales (controles) ----------
    setData(surfaceId, path, value, { origin } = {}) {
      const surface = ensure(surfaceId);
      if (!surface || !isValidPointer(path) || path === '') return false;
      surface.dataModel = setAt(surface.dataModel, path, value);
      surface.version += 1;
      notify({ type: 'updateDataModel', surfaceId, path, source: 'local', origin });
      return true;
    },

    // ---------- acciones ----------
    // Devuelve { kind: 'event', payload } para mandar al agente, { kind: 'local' }
    // si se resolvió aquí, o null si la acción no es válida.
    dispatchAction(surfaceId, action, { scope = '' } = {}) {
      const surface = ensure(surfaceId);
      if (!surface || !isObject(action)) return null;
      if (isObject(action.functionCall) && typeof action.functionCall.call === 'string') {
        const { call, args } = action.functionCall;
        const fn = Object.prototype.hasOwnProperty.call(LOCAL_ACTIONS, call) ? LOCAL_ACTIONS[call] : null;
        if (!fn) return null;
        // Los args se resuelven llave por llave: `path` aquí es el destino de
        // la escritura, no un binding a leer.
        const resolvedArgs = {};
        for (const [key, value] of Object.entries(isObject(args) ? args : {})) {
          resolvedArgs[key] = key === 'path' ? value : resolveActionContext(value, { model: surface.dataModel, scope, functions });
        }
        if (typeof resolvedArgs.path === 'string' && !resolvedArgs.path.startsWith('/')) {
          resolvedArgs.path = joinPointer(scope, resolvedArgs.path);
        }
        fn(store, surfaceId, resolvedArgs);
        return { kind: 'local', call };
      }
      if (isObject(action.event) && typeof action.event.name === 'string') {
        const context = resolveActionContext(action.event.context ?? {}, { model: surface.dataModel, scope, functions });
        const payload = {
          surfaceId,
          event: { name: action.event.name, context },
        };
        if (surface.sendDataModel) payload.dataModel = surface.dataModel;
        return { kind: 'event', payload };
      }
      return null;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      surfaces.clear();
      notify({ type: 'reset' });
    },
  };

  return store;
}

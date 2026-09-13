// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Del árbol que escribe el modelo a la lista de adyacencia de A2UI, y de vuelta.
//
// A2UI describe la interfaz como una lista plana de componentes con `id`, donde
// los contenedores referencian a sus hijos por id (`children: ["a","b"]`). Los
// LLM generan mucho mejor JSON anidado que grafos con identificadores, así que
// el modelo escribe `children: [{...}, {...}]` y aquí se aplana. El cliente
// siempre recibe la forma plana y conformante.
//
// También se tolera lo que el modelo suele variar: `type` en vez de
// `component`, nombres en minúsculas, un solo hijo fuera de arreglo y los
// componentes de Norte UI Spec v1 (se elevan con compat.js).

import { CONTAINER_COMPONENTS, ROOT_ID, canonicalComponentName } from './catalog-v2.js';
import { isV1Type, liftV1Component } from './compat.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Un objeto es referencia de plantilla si trae `path` (y no es un componente).
const isTemplateRef = (value) => isObject(value) && typeof value.path === 'string' && !('component' in value) && !('type' in value);

export function flattenTree(input, { rootId = ROOT_ID } = {}) {
  const components = [];
  const used = new Set();
  // Nombres que el modelo inventó y que no se pudieron mapear: se descartan,
  // pero se devuelven para que el servidor los pueda registrar. Un hueco en la
  // pantalla sin rastro en el log es lo más caro de diagnosticar.
  const dropped = [];
  let counter = 0;

  const claimId = (wanted, hint) => {
    if (typeof wanted === 'string' && wanted.trim() && !used.has(wanted.trim())) {
      used.add(wanted.trim());
      return wanted.trim();
    }
    let id;
    do {
      counter += 1;
      id = `${String(hint ?? 'c').toLowerCase()}_${counter}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };

  // Devuelve el id del componente insertado, o null si no era un componente válido.
  function visit(node, forcedId) {
    if (!isObject(node)) return null;
    let current = node;
    const rawName = current.component ?? current.type;
    if (typeof rawName === 'string' && isV1Type(rawName) && !('component' in current)) {
      current = liftV1Component(current);
      if (!current) return null;
    }
    const name = canonicalComponentName(current.component ?? current.type);
    if (!name) {
      const unknown = current.component ?? current.type;
      if (typeof unknown === 'string' && unknown.trim()) dropped.push(unknown.trim());
      return null;
    }

    const id = claimId(forcedId ?? current.id, name);
    const copy = { ...current, id, component: name };
    if (!('component' in current)) delete copy.type;
    else if (copy.type === rawName) delete copy.type;
    const slot = components.length;
    components.push(copy);

    // children: arreglo de ids/objetos, un solo objeto, o plantilla {path, template}.
    if ('children' in copy) copy.children = flattenChildren(copy.children, id);

    if ('child' in copy && isObject(copy.child)) {
      const childId = visit(copy.child);
      if (childId) copy.child = childId;
      else delete copy.child;
    }

    // List: items {path} + template {…} → children {path, componentId}.
    if (name === 'List') {
      const items = copy.items;
      const template = copy.template;
      if (isTemplateRef(copy.children)) {
        // ya viene en forma A2UI (o con template dentro): resuelto arriba/abajo
      } else if (isTemplateRef(items) && isObject(template)) {
        const templateId = visit(template);
        copy.children = templateId ? { path: items.path, componentId: templateId } : [];
        delete copy.items;
        delete copy.template;
      } else if (Array.isArray(items) && isObject(template)) {
        // Lista literal: se mete al modelo por el componente (el runtime la lee de `itemsLiteral`).
        const templateId = visit(template);
        copy.itemsLiteral = items;
        copy.children = templateId ? { path: `/__lists/${id}`, componentId: templateId } : [];
        delete copy.items;
        delete copy.template;
      }
    }

    // Tabs: items [{label, child|children}] → cada pestaña apunta a un id.
    if (name === 'Tabs' && Array.isArray(copy.items)) {
      copy.items = copy.items
        .filter(isObject)
        .map((tab, index) => {
          if (typeof tab.child === 'string') return { label: String(tab.label ?? `Tab ${index + 1}`), child: tab.child };
          if (isObject(tab.child)) {
            const childId = visit(tab.child);
            return childId ? { label: String(tab.label ?? `Tab ${index + 1}`), child: childId } : null;
          }
          const children = Array.isArray(tab.children) ? tab.children : isObject(tab.children) ? [tab.children] : [];
          const stackId = visit({ component: 'Stack', id: `${id}_tab${index + 1}`, children });
          return stackId ? { label: String(tab.label ?? `Tab ${index + 1}`), child: stackId } : null;
        })
        .filter(Boolean);
    }

    components[slot] = copy;
    return id;
  }

  function flattenChildren(children, parentId) {
    if (isTemplateRef(children)) {
      if (isObject(children.template)) {
        const templateId = visit(children.template);
        return templateId ? { path: children.path, componentId: templateId } : [];
      }
      if (typeof children.componentId === 'string') return { path: children.path, componentId: children.componentId };
      return [];
    }
    const list = Array.isArray(children) ? children : isObject(children) ? [children] : [];
    return list
      .map((child) => (typeof child === 'string' ? child : visit(child)))
      .filter((childId) => typeof childId === 'string' && childId);
  }

  if (Array.isArray(input)) {
    const root = { component: 'Stack', id: rootId, children: input };
    visit(root, rootId);
  } else if (isObject(input)) {
    visit(input, rootId);
  }

  // Referencias colgantes ("hijo": "algo" que no existe en el árbol) se quitan:
  // en un árbol completo no hay componentes por llegar, así que son basura.
  const known = new Set(components.map((c) => c.id));
  for (const component of components) {
    if (Array.isArray(component.children)) component.children = component.children.filter((id) => known.has(id));
    if (typeof component.child === 'string' && !known.has(component.child)) delete component.child;
    if (component.component === 'Tabs' && Array.isArray(component.items)) {
      component.items = component.items.filter((tab) => known.has(tab.child));
    }
  }

  return { rootId, components, dropped };
}

// Ids de hijos directos de un componente ya aplanado (sin las plantillas).
export function childIds(component) {
  const ids = [];
  if (!isObject(component)) return ids;
  if (Array.isArray(component.children)) ids.push(...component.children.filter((c) => typeof c === 'string'));
  else if (isTemplateRef(component.children) && typeof component.children.componentId === 'string') ids.push(component.children.componentId);
  if (typeof component.child === 'string') ids.push(component.child);
  if (Array.isArray(component.items) && component.component === 'Tabs') {
    for (const tab of component.items) if (isObject(tab) && typeof tab.child === 'string') ids.push(tab.child);
  }
  return ids;
}

export function isTemplatedChildren(children) {
  return isTemplateRef(children) && typeof children.componentId === 'string';
}

// Orden de anchura desde la raíz: es el orden en que se transmiten los
// componentes para que la pantalla se arme de arriba hacia abajo.
export function orderFromRoot(components, rootId = ROOT_ID) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const ordered = [];
  const seen = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    const component = byId.get(id);
    ordered.push(component);
    queue.push(...childIds(component));
  }
  // Lo que no cuelga de la raíz (huérfanos) va al final: no se pinta, pero no se pierde.
  for (const component of components) if (!seen.has(component.id)) ordered.push(component);
  return ordered;
}

// Reconstruye el árbol anidado (para docs, tests y toV1).
export function treeFromFlat(components, rootId = ROOT_ID) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const build = (id, depth = 0) => {
    const component = byId.get(id);
    if (!component || depth > 32) return null;
    const node = { ...component };
    if (Array.isArray(node.children)) node.children = node.children.map((c) => build(c, depth + 1)).filter(Boolean);
    if (typeof node.child === 'string') node.child = build(node.child, depth + 1);
    if (node.component === 'Tabs' && Array.isArray(node.items)) {
      node.items = node.items.map((tab) => ({ ...tab, child: build(tab.child, depth + 1) }));
    }
    return node;
  };
  return build(rootId);
}

export const isContainer = (component) => CONTAINER_COMPONENTS.has(component?.component);

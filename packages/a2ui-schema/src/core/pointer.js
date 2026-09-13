// JSON Pointer (RFC 6901) sobre el modelo de datos de una superficie A2UI.
//
// Todas las operaciones son inmutables: `setAt` y `removeAt` devuelven un modelo
// nuevo compartiendo estructura con el anterior, así React (mobile) y el
// renderer web pueden comparar por referencia para saber qué cambió.
//
// Sin dependencias: este archivo se sirve tal cual al navegador y se copia a la
// app móvil (ver scripts/sync-a2ui-core.js).

const ESCAPE_RE = /~[01]/g;
const UNESCAPE = { '~0': '~', '~1': '/' };

// '/a/b' → ['a', 'b'] · '' → [] · '/' → [''] (la llave vacía, según RFC 6901).
export function parsePointer(pointer) {
  if (pointer === undefined || pointer === null) return [];
  const text = String(pointer);
  if (text === '') return [];
  if (!text.startsWith('/')) throw new Error(`JSON Pointer inválido: "${text}" (debe empezar con "/")`);
  return text
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(ESCAPE_RE, (m) => UNESCAPE[m]));
}

export function isValidPointer(pointer) {
  if (pointer === '') return true;
  if (typeof pointer !== 'string') return false;
  return pointer.startsWith('/');
}

const escapeSegment = (segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1');

export function buildPointer(segments) {
  if (!segments.length) return '';
  return `/${segments.map(escapeSegment).join('/')}`;
}

// Une un puntero base con uno relativo ('amount' o '/abs'). Un relativo vacío
// devuelve la base: dentro de una lista, "" es el elemento completo.
export function joinPointer(base, relative) {
  const rel = relative === undefined || relative === null ? '' : String(relative);
  if (rel.startsWith('/')) return rel;
  if (rel === '') return base || '';
  const baseSegments = parsePointer(base || '');
  return buildPointer([...baseSegments, ...rel.split('/')]);
}

export function getAt(model, pointer) {
  let current = model;
  for (const segment of parsePointer(pointer)) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

const isIndex = (segment) => /^\d+$/.test(segment);

// Crea los contenedores intermedios que falten: objetos por defecto, arreglos
// cuando el siguiente segmento es un índice numérico.
function assign(container, segments, value, { remove = false } = {}) {
  const [head, ...rest] = segments;
  const isArray = Array.isArray(container);
  const base = isArray ? [...container] : { ...(container && typeof container === 'object' ? container : {}) };
  const key = isArray ? Number(head) : head;

  if (!rest.length) {
    if (remove) {
      if (isArray) base.splice(key, 1);
      else delete base[key];
    } else {
      base[key] = value;
    }
    return base;
  }

  const existing = base[key];
  const child =
    existing && typeof existing === 'object' ? existing : isIndex(rest[0]) ? [] : {};
  base[key] = assign(child, rest, value, { remove });
  return base;
}

// `value === null` borra la llave (semántica de updateDataModel en A2UI).
export function setAt(model, pointer, value) {
  const segments = parsePointer(pointer);
  if (!segments.length) return value === null ? {} : value;
  if (value === null) return removeAt(model, pointer);
  return assign(model ?? {}, segments, value);
}

export function removeAt(model, pointer) {
  const segments = parsePointer(pointer);
  if (!segments.length) return {};
  if (getAt(model, pointer) === undefined) return model ?? {};
  return assign(model ?? {}, segments, undefined, { remove: true });
}

// ¿`a` es prefijo de `b` (o iguales)? Se usa para saber si un cambio en `a`
// afecta a quien leyó `b`, y viceversa.
export function isPointerPrefix(a, b) {
  if (a === b) return true;
  if (a === '' || a === '/') return true;
  return String(b).startsWith(`${a}/`);
}

// ¿Un cambio en `changed` afecta a una lectura de `read`? Sí cuando uno
// contiene al otro: cambiar /sim recalcula /sim/months, y cambiar /sim/months
// invalida a quien leyó /sim completo.
export function pointersOverlap(changed, read) {
  return isPointerPrefix(changed, read) || isPointerPrefix(read, changed);
}

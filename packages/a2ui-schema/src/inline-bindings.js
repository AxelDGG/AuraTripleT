// Rescate de bindings escritos como texto.
//
// El contrato dice que un binding es un valor JSON ({"path":...} o
// {"call":...,"args":{...}}), pero los modelos a veces lo escriben como si
// fuera una plantilla de Handlebars dentro de una cadena:
//
//   "markdown": "**Fecha límite:** {{call \"date\" args={\"v\":{\"path\":\"/accounts/2/paymentDue\"}}}}"
//
// Eso llega al cliente como texto y la persona ve la sintaxis cruda en
// pantalla. Aquí se reconoce esa forma (con o sin comillas, simples o dobles)
// y se convierte en el binding que el modelo quiso escribir: si la cadena es
// una sola plantilla, el binding solo; si mezcla texto y datos, un
// {"call":"template"} con un hueco por plantilla.
//
// Solo se toca lo que se entiende: una plantilla que no se puede parsear se
// queda tal cual en vez de desaparecer del texto.

import { isBinding, resolveDynamic } from './core/binding.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const MAX_DEPTH = 12;

// ---------- parser tolerante de literales tipo JS ----------
//
// JSON.parse no sirve: lo que escribe el modelo trae claves sin comillas
// (v:{path:...}) y comillas simples. Es un subconjunto de literal de JS, sin
// expresiones ni funciones: nunca se evalúa nada, solo se leen datos.

function parseLoose(src) {
  let i = 0;

  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i += 1;
  };

  function string() {
    const quote = src[i];
    i += 1;
    let out = '';
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        i += 1;
        if (i >= src.length) throw new Error('cadena sin cerrar');
      }
      out += src[i];
      i += 1;
    }
    if (src[i] !== quote) throw new Error('cadena sin cerrar');
    i += 1;
    return out;
  }

  function key() {
    if (src[i] === '"' || src[i] === "'") return string();
    const match = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (!match) throw new Error('clave inválida');
    i += match[0].length;
    return match[0];
  }

  function object(depth) {
    i += 1;
    const out = {};
    ws();
    if (src[i] === '}') {
      i += 1;
      return out;
    }
    for (;;) {
      ws();
      const name = key();
      ws();
      // El modelo escribe tanto {"a":1} como {a=1}.
      if (src[i] !== ':' && src[i] !== '=') throw new Error('se esperaba ":"');
      i += 1;
      out[name] = value(depth + 1);
      ws();
      if (src[i] === ',') {
        i += 1;
        ws();
        if (src[i] === '}') {
          i += 1;
          return out;
        }
        continue;
      }
      if (src[i] === '}') {
        i += 1;
        return out;
      }
      throw new Error('se esperaba "," o "}"');
    }
  }

  function array(depth) {
    i += 1;
    const out = [];
    ws();
    if (src[i] === ']') {
      i += 1;
      return out;
    }
    for (;;) {
      out.push(value(depth + 1));
      ws();
      if (src[i] === ',') {
        i += 1;
        ws();
        if (src[i] === ']') {
          i += 1;
          return out;
        }
        continue;
      }
      if (src[i] === ']') {
        i += 1;
        return out;
      }
      throw new Error('se esperaba "," o "]"');
    }
  }

  function value(depth) {
    if (depth > MAX_DEPTH) throw new Error('demasiado anidado');
    ws();
    const char = src[i];
    if (char === undefined) throw new Error('valor vacío');
    if (char === '{') return object(depth);
    if (char === '[') return array(depth);
    if (char === '"' || char === "'") return string();
    const literal = /^(true|false|null)(?![\w$])/.exec(src.slice(i));
    if (literal) {
      i += literal[0].length;
      return literal[0] === 'null' ? null : literal[0] === 'true';
    }
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w$.])/.exec(src.slice(i));
    if (number) {
      i += number[0].length;
      return Number(number[0]);
    }
    // Token suelto: una ruta sin comillas (path:/cuentas/0/saldo) o una palabra.
    const bare = /^[^,{}[\]\s]+/.exec(src.slice(i));
    if (!bare) throw new Error('valor inválido');
    i += bare[0].length;
    return bare[0];
  }

  const out = value(0);
  ws();
  if (i !== src.length) throw new Error('sobra texto');
  return out;
}

const tryParse = (src) => {
  try {
    return { ok: true, value: parseLoose(src) };
  } catch {
    return { ok: false };
  }
};

// ---------- reconocimiento de una plantilla ----------

// Qué hay entre {{ y }}. Devuelve el binding o null si no se entiende.
export function parseInlineBinding(inner) {
  const text = String(inner ?? '').trim();
  if (!text) return null;

  // {{ {"call":"currency","args":{...}} }}
  if (text.startsWith('{')) {
    const parsed = tryParse(text);
    return parsed.ok && isBinding(parsed.value) ? parsed.value : null;
  }

  // {{call "date" args={"v":{"path":"/x"}}}} y sus variantes sin comillas.
  const call = /^call\s*[:=]?\s*["']?([A-Za-z_]\w*)["']?\s*,?\s*(?:(?:args|params)\s*[:=]\s*([\s\S]+))?$/.exec(text);
  if (call) {
    const [, name, rawArgs] = call;
    if (!rawArgs) return { call: name, args: {} };
    const parsed = tryParse(rawArgs.trim());
    if (!parsed.ok || !isObject(parsed.value)) return null;
    return { call: name, args: parsed.value };
  }

  // {{/cuentas/0/saldo}} o {{path:"/cuentas/0/saldo"}}
  const path = /^(?:path\s*[:=]\s*)?["']?(\/[^"'\s]*)["']?$/.exec(text);
  if (path) return { path: path[1] };

  return null;
}

// Las plantillas de una cadena, con sus posiciones. Cuenta llaves y respeta
// comillas para no cortar en el "}" de un argumento anidado.
function scanTemplates(text) {
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] !== '{' || text[i + 1] !== '{') continue;
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let j = i + 2; j < text.length; j += 1) {
      const char = text[j];
      if (quote) {
        if (char === '\\') j += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char !== '}') continue;
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      if (text[j + 1] === '}') end = j + 2;
      break;
    }
    if (end === -1) continue;
    out.push({ start: i, end, inner: text.slice(i + 2, end - 2) });
    i = end - 1;
  }
  return out;
}

// ---------- reparación ----------

// Una cadena con plantillas → el binding equivalente. Si no hay plantillas (o
// ninguna se entiende) devuelve la misma cadena.
export function repairInlineString(text, onRepair) {
  if (typeof text !== 'string' || !text.includes('{{')) return text;
  const spans = scanTemplates(text);
  if (!spans.length) return text;

  const args = {};
  let out = '';
  let cursor = 0;
  let count = 0;
  for (const span of spans) {
    const binding = parseInlineBinding(span.inner);
    if (!binding) continue;
    const name = `v${count}`;
    count += 1;
    out += `${text.slice(cursor, span.start)}{${name}}`;
    args[name] = binding;
    cursor = span.end;
  }
  if (!count) return text;
  out += text.slice(cursor);
  onRepair?.(text);
  // Toda la cadena era una sola plantilla: el binding va solo, sin envoltura.
  if (count === 1 && out === '{v0}') return args.v0;
  return { call: 'template', args: { text: out, ...args } };
}

// Lo mismo, recorriendo un valor completo (las props de un componente).
export function repairInlineBindings(value, onRepair, depth = 0) {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === 'string') return repairInlineString(value, onRepair);
  if (Array.isArray(value)) return value.map((item) => repairInlineBindings(item, onRepair, depth + 1));
  if (isObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = repairInlineBindings(item, onRepair, depth + 1);
    return out;
  }
  return value;
}

// Para el texto que no admite bindings (el mensaje hablado, el título): se
// resuelve contra el dataModel y queda el valor ya formateado.
export function resolveInlineString(text, model, onRepair) {
  if (typeof text !== 'string' || !text.includes('{{')) return text;
  const spans = scanTemplates(text);
  if (!spans.length) return text;
  let out = '';
  let cursor = 0;
  let count = 0;
  for (const span of spans) {
    const binding = parseInlineBinding(span.inner);
    if (!binding) continue;
    const resolved = resolveDynamic(binding, { model: model ?? {} });
    out += text.slice(cursor, span.start) + (resolved === undefined || resolved === null ? '' : String(resolved));
    cursor = span.end;
    count += 1;
  }
  if (!count) return text;
  onRepair?.(text);
  return `${out}${text.slice(cursor)}`.replace(/\s+([,.;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

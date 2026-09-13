// El catálogo es un contrato con tres consumidores: el prompt del agente, el
// renderer web y el renderer nativo. Estos tests fallan si alguno se queda
// atrás, que es lo que pasó cuando DataTable, Calendar y DatePicker entraron al
// catálogo y a la web pero no a la app: en el teléfono esos bloques salían en
// blanco y nadie se enteraba.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPONENT_CATALOG_V2,
  COMPONENT_NAMES_V2,
  FUNCTION_GUIDE,
  INTERNAL_COMPONENTS,
  RENDERER_FUNCTION_NAMES,
  componentsPromptSectionV2,
} from '../src/index.js';

const read = (relative) => readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');

// Las llaves de un objeto-registro escrito como `Nombre,` o `Nombre: ...`.
function registryKeys(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start > 0, `no se encontró ${startMarker}`);
  const block = source.slice(start, source.indexOf(endMarker, start));
  return new Set([...block.matchAll(/^ {2}([A-Z][A-Za-z]*)\s*[(:,]/gm)].map((m) => m[1]));
}

test('el renderer web sabe pintar todo el catálogo', () => {
  const keys = registryKeys(read('apps/web/public/js/a2ui-web.js'), 'const COMPONENTS = {', '\nexport const SUPPORTED_COMPONENTS');
  for (const name of [...COMPONENT_NAMES_V2, ...INTERNAL_COMPONENTS]) {
    assert.ok(keys.has(name), `falta ${name} en apps/web/public/js/a2ui-web.js`);
  }
});

test('el renderer nativo sabe pintar todo el catálogo', () => {
  const keys = registryKeys(read('apps/mobile/src/a2ui/A2UIRenderer.js'), 'const REGISTRY = {', '\nexport const SUPPORTED_COMPONENTS');
  for (const name of [...COMPONENT_NAMES_V2, ...INTERNAL_COMPONENTS]) {
    assert.ok(keys.has(name), `falta ${name} en apps/mobile/src/a2ui/A2UIRenderer.js`);
  }
});

test('cada componente del catálogo se describe una sola vez, y esa descripción llega al prompt', () => {
  const prompt = componentsPromptSectionV2();
  for (const entry of COMPONENT_CATALOG_V2) {
    assert.ok(['layout', 'domain', 'input', 'action'].includes(entry.kind), `${entry.name}: kind inválido`);
    assert.equal(typeof entry.container, 'boolean', `${entry.name}: falta container`);
    assert.ok(entry.signature?.startsWith(entry.name), `${entry.name}: falta la firma para el prompt`);
    assert.ok(entry.hint?.length > 10, `${entry.name}: falta el hint del descriptor`);
    // Un ejemplo por componente era una tercera descripción que se desfasaba.
    assert.equal(entry.example, undefined, `${entry.name}: el ejemplo por componente ya no existe`);
    assert.ok(prompt.includes(entry.signature), `${entry.name}: su firma no llegó al prompt`);
  }
});

test('la negociación de catálogo también recorta el ejemplo del prompt', () => {
  const full = componentsPromptSectionV2();
  assert.ok(full.includes('"component":"Slider"'), 'el ejemplo completo enseña un control ligado');

  const minimal = componentsPromptSectionV2({ only: ['Stack', 'Text'] });
  assert.ok(minimal.includes('Stack{'), 'conserva lo que el cliente sí tiene');
  for (const name of ['Slider', 'Calendar', 'DataTable', 'DatePicker', 'Chart']) {
    assert.ok(!minimal.includes(name), `${name} no debería aparecer para un cliente que no lo pinta`);
  }
  // Sin controles ni acciones, esas secciones desaparecen en vez de quedar vacías.
  assert.ok(!minimal.includes('Acciones:'));
});

test('las funciones que el prompt documenta existen de verdad', () => {
  const guide = FUNCTION_GUIDE.join(' ');
  const known = new Set(RENDERER_FUNCTION_NAMES);
  // "currency({v})" y "add/sub/mul/div({a,b})": el nombre va pegado al paréntesis
  // y separado por espacio o "/". Lo de dentro de las llaves son argumentos.
  const documented = [...guide.matchAll(/(?:^|[\s·])([a-zA-Z/]+)\(/g)].flatMap((m) => m[1].split('/'));
  assert.ok(documented.length > 20, 'el prompt documenta las funciones con su firma');
  for (const name of documented) {
    assert.ok(known.has(name), `el prompt documenta ${name}() y no existe en el runtime`);
  }
  // Y las que el producto necesita sí están documentadas.
  for (const name of ['currency', 'amortize', 'totalInterest', 'schedule', 'coalesce', 'interestSavings', 'if', 'pluck']) {
    assert.ok(known.has(name), `${name} no existe en el runtime`);
    assert.ok(FUNCTION_GUIDE.join(' ').includes(name), `${name} no está documentada en el prompt`);
  }
});

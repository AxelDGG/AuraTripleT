import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUiJson } from '../src/ui-spec.js';

test('parseUiJson acepta JSON limpio', () => {
  const parsed = parseUiJson('{"message":"hola","ui":[{"type":"alert","text":"x"}]}');
  assert.equal(parsed.message, 'hola');
  assert.equal(parsed.ui.length, 1);
});

test('parseUiJson extrae JSON de bloques markdown y texto circundante', () => {
  const fenced = parseUiJson('Aquí tienes:\n```json\n{"message":"ok","ui":[]}\n```\n¡Listo!');
  assert.equal(fenced.message, 'ok');
  const wrapped = parseUiJson('Claro. {"message":"m","ui":[{"type":"text","markdown":"a"}]} fin');
  assert.equal(wrapped.ui[0].type, 'text');
});

test('parseUiJson normaliza campos faltantes o con tipo incorrecto', () => {
  const noUi = parseUiJson('{"message":"solo texto"}');
  assert.deepEqual(noUi.ui, []);
  const badMessage = parseUiJson('{"message":42,"ui":[]}');
  assert.equal(badMessage.message, '');
});

test('parseUiJson aplica el contrato Norte UI Spec a cada componente', () => {
  const parsed = parseUiJson('{"message":"m","ui":[{"type":"alert","level":"fatal","text":"x"},{"type":"nope"}]}');
  assert.equal(parsed.ui.length, 1);
  assert.equal(parsed.ui[0].level, 'info');
});

test('parseUiJson devuelve null ante contenido inválido', () => {
  assert.equal(parseUiJson(''), null);
  assert.equal(parseUiJson(null), null);
  assert.equal(parseUiJson('esto no es json'), null);
  assert.equal(parseUiJson('{"roto": '), null);
  assert.equal(parseUiJson('[1,2,3]'), null);
});

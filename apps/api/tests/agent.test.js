import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUiJson, extractFailedGeneration } from '../src/agent.js';

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

test('parseUiJson devuelve null ante contenido inválido', () => {
  assert.equal(parseUiJson(''), null);
  assert.equal(parseUiJson(null), null);
  assert.equal(parseUiJson('esto no es json'), null);
  assert.equal(parseUiJson('{"roto": '), null);
  assert.equal(parseUiJson('[1,2,3]'), null);
});

test('extractFailedGeneration recupera la UI de un envoltorio de tool call "json"', () => {
  const body = JSON.stringify({
    error: {
      code: 'tool_use_failed',
      message: "attempted to call tool 'json' which was not in request.tools",
      failed_generation: '{"name": "json", "arguments": {"message":"Confirma","ui":[{"type":"form","action":"transfer_funds","fields":[]}]}}',
    },
  });
  const recovered = extractFailedGeneration(body);
  assert.ok(recovered);
  const parsed = parseUiJson(recovered);
  assert.equal(parsed.message, 'Confirma');
  assert.equal(parsed.ui[0].type, 'form');
});

test('extractFailedGeneration acepta failed_generation que ya es la UI en JSON', () => {
  const body = JSON.stringify({
    error: { code: 'tool_use_failed', failed_generation: '{"message":"ok","ui":[{"type":"alert","text":"x"}]}' },
  });
  const parsed = parseUiJson(extractFailedGeneration(body));
  assert.equal(parsed.ui[0].type, 'alert');
});

test('extractFailedGeneration devuelve null para otros errores o contenido irrecuperable', () => {
  assert.equal(extractFailedGeneration('no json'), null);
  assert.equal(extractFailedGeneration(JSON.stringify({ error: { code: 'rate_limit', failed_generation: '{}' } })), null);
  assert.equal(extractFailedGeneration(JSON.stringify({ error: { code: 'tool_use_failed', failed_generation: 'texto sin json' } })), null);
});

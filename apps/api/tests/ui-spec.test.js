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

// ---------- Norte A2UI v2 ----------
import { parseAgentReply } from '../src/ui-spec.js';

test('parseAgentReply devuelve una superficie aplanada con proyección v1', () => {
  const reply = parseAgentReply('```json\n{"message":"m","title":"T","dataModel":{"n":1},"ui":[{"component":"Kpi","label":"a","value":{"path":"/n"}}]}\n```', { surfaceId: 'fixed' });
  assert.equal(reply.kind, 'surface');
  assert.equal(reply.surface.surfaceId, 'fixed');
  assert.deepEqual(reply.surface.components.map((c) => c.component), ['Stack', 'Kpi']);
  assert.equal(reply.ui[0].items[0].value, '1');
});

test('parseAgentReply acepta un patch solo sobre la superficie activa', () => {
  const raw = '{"message":"m","surfaceId":"s1","updates":[{"path":"/a","value":2}]}';
  assert.equal(parseAgentReply(raw, { activeSurfaceId: 's1' }).kind, 'patch');
  assert.equal(parseAgentReply(raw, { activeSurfaceId: 'otra' }).kind, 'surface');
});

test('parseAgentReply devuelve null ante contenido inválido', () => {
  assert.equal(parseAgentReply(''), null);
  assert.equal(parseAgentReply('no json'), null);
  assert.equal(parseAgentReply('{"foo":1}'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { booleanArg, numberArg } from '../src/arg-schemas.js';

// Regresión: el modelo mandaba daysBefore como "1" y el protocolo respondía
// "-32602 Input validation error", que la interfaz pintaba como un error del
// servicio ("no pudimos obtener las fechas límite") con los datos intactos.
test('numberArg acepta el número en texto que manda el modelo', () => {
  const schema = numberArg();
  assert.equal(schema.parse('1'), 1);
  assert.equal(schema.parse('3'), 3);
  assert.equal(schema.parse('150000'), 150000);
  assert.equal(schema.parse('12.5'), 12.5);
  assert.equal(schema.parse('-5'), -5);
  // Lo que ya venía bien sigue igual.
  assert.equal(schema.parse(7), 7);
});

test('numberArg no adivina: lo que no es un número sigue siendo error', () => {
  const schema = numberArg();
  for (const value of ['muchos', '', '  ', 'abc', '1 mes', true, {}, []]) {
    assert.equal(schema.safeParse(value).success, false, `debería rechazar ${JSON.stringify(value)}`);
  }
});

test('booleanArg acepta el booleano en texto y rechaza lo demás', () => {
  const schema = booleanArg();
  assert.equal(schema.parse('true'), true);
  assert.equal(schema.parse('false'), false);
  assert.equal(schema.parse(true), true);
  for (const value of ['sí', '1', 1, 'yes', '']) {
    assert.equal(schema.safeParse(value).success, false, `debería rechazar ${JSON.stringify(value)}`);
  }
});

// .nullish() sigue siendo el que decide si el campo es opcional: la conversión
// no debe convertir un null (campo vacío) en 0.
test('la tolerancia no se come el null de un campo opcional', () => {
  const schema = numberArg().nullish();
  assert.equal(schema.parse(null), null);
  assert.equal(schema.parse(undefined), undefined);
  assert.equal(schema.parse('5'), 5);
});

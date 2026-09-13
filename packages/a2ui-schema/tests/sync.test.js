// La app móvil lleva una copia del núcleo (no está en los workspaces): este
// test falla si alguien edita el núcleo sin correr `npm run sync:a2ui`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffs, coreFiles } from '../../../scripts/sync-a2ui-core.js';

test('la copia móvil de packages/a2ui-schema/src/core está sincronizada', () => {
  assert.ok(coreFiles().includes('runtime.js'));
  assert.deepEqual(diffs(), [], 'corre `npm run sync:a2ui` para actualizar apps/mobile/src/a2ui/core');
});

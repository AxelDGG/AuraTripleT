// Mensajes A2UI v1.0 (zod) y el sobre que emite el agente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  A2UI_VERSION,
  CATALOG_ID,
  MESSAGE_KINDS,
  makeMessage,
  normalizeAgentReply,
  parseClientCapabilities,
  parseMessage,
  parseUserAction,
} from '../src/index.js';

test('makeMessage produce envelopes v1.0 válidos y rechaza payloads rotos', () => {
  assert.deepEqual(MESSAGE_KINDS, ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']);
  const created = makeMessage('createSurface', { surfaceId: 's1', components: [{ id: 'root', component: 'stack' }, { nope: 1 }] });
  assert.equal(created.version, A2UI_VERSION);
  assert.equal(created.createSurface.catalogId, CATALOG_ID);
  assert.equal(created.createSurface.sendDataModel, true);
  assert.deepEqual(created.createSurface.components, [{ id: 'root', component: 'Stack' }]);
  assert.deepEqual(created.createSurface.dataModel, {});

  assert.equal(makeMessage('updateDataModel', { surfaceId: 's1', path: '/a/b', value: 1 }).updateDataModel.path, '/a/b');
  assert.equal(makeMessage('updateDataModel', { surfaceId: 's1', value: {} }).updateDataModel.path, '');
  assert.equal(makeMessage('updateDataModel', { surfaceId: 's1', path: 'a', value: 1 }), null);
  assert.equal(makeMessage('deleteSurface', {}), null);
  assert.equal(makeMessage('inventado', { surfaceId: 's1' }), null);
});

test('parseMessage valida un envelope entrante', () => {
  const ok = parseMessage({ version: 'v1.0', updateComponents: { surfaceId: 's', components: [{ id: 'a', type: 'text', markdown: 'x' }] } });
  assert.equal(ok.updateComponents.components[0].component, 'Text');
  assert.equal(ok.updateComponents.components[0].type, undefined);
  assert.equal(parseMessage({ version: 'v1.0', updateComponents: { components: [] } }), null);
  assert.equal(parseMessage('texto'), null);
});

test('parseUserAction acepta un evento con contexto y modelo, y rechaza nombres raros', () => {
  const action = parseUserAction({ surfaceId: 's', event: { name: 'confirm_transfer', context: { amount: 100 } }, dataModel: { a: 1 } });
  assert.equal(action.event.name, 'confirm_transfer');
  assert.deepEqual(action.dataModel, { a: 1 });
  assert.deepEqual(parseUserAction({ surfaceId: 's', event: { name: 'x', context: 'no' } }).event.context, {});
  assert.equal(parseUserAction({ surfaceId: 's', event: { name: 'rm -rf /' } }), null);
  assert.equal(parseUserAction({ event: { name: 'x' } }), null);
});

test('parseClientCapabilities filtra lo que no es string', () => {
  const caps = parseClientCapabilities({ catalogId: CATALOG_ID, components: ['Kpi', 3, 'Chart'], platform: 'web' });
  assert.deepEqual(caps.components, ['Kpi', 'Chart']);
  assert.equal(parseClientCapabilities({ platform: 'tv' }), null);
  assert.equal(parseClientCapabilities(null), null);
});

test('normalizeAgentReply: árbol anidado → superficie plana + proyección v1', () => {
  const reply = normalizeAgentReply({
    message: 'Listo.',
    title: 'Plan',
    folder: 'PROMOCIONES',
    dataModel: { plan: { months: 12 } },
    ui: [
      { component: 'Header', title: 'Reestructura' },
      { component: 'Grid', columns: 2, children: [{ component: 'Kpi', label: 'Meses', value: { path: '/plan/months' } }] },
      { type: 'alert', text: 'v1 también entra' },
    ],
  }, { surfaceId: 'fixed' });
  assert.equal(reply.kind, 'surface');
  assert.equal(reply.folder, 'promociones');
  assert.equal(reply.title, 'Plan');
  assert.equal(reply.surface.surfaceId, 'fixed');
  assert.equal(reply.surface.catalogId, CATALOG_ID);
  assert.deepEqual(reply.surface.components.map((c) => c.component), ['Stack', 'Header', 'Grid', 'Kpi', 'Alert']);
  assert.deepEqual(reply.ui.map((c) => c.type), ['header', 'kpi_grid', 'alert']);
  assert.equal(reply.ui[1].items[0].value, '12', 'la proyección v1 resuelve bindings');
});

test('normalizeAgentReply: título derivado, entradas vacías y ids únicos', () => {
  const fromHeader = normalizeAgentReply({ message: 'm', ui: [{ component: 'Header', title: 'Gastos de agosto' }] });
  assert.equal(fromHeader.title, 'Gastos de agosto');
  const fromMessage = normalizeAgentReply({ message: 'Tu saldo es $1. Creció.', ui: [] });
  assert.equal(fromMessage.title, 'Tu saldo es $1.');
  const empty = normalizeAgentReply(null);
  assert.equal(empty.kind, 'surface');
  assert.equal(empty.surface.components.length, 1, 'siempre hay una raíz');
  assert.notEqual(normalizeAgentReply({ ui: [] }).surface.surfaceId, normalizeAgentReply({ ui: [] }).surface.surfaceId);
});

test('normalizeAgentReply: patch solo sobre la superficie activa', () => {
  const patch = normalizeAgentReply(
    { message: 'A 6 meses.', surfaceId: 's1', updates: [{ path: '/plan/months', value: 6 }, { path: 'malo', value: 1 }] },
    { activeSurfaceId: 's1' },
  );
  assert.equal(patch.kind, 'patch');
  assert.equal(patch.surfaceId, 's1');
  assert.deepEqual(patch.updates, [{ path: '/plan/months', value: 6 }]);

  const stale = normalizeAgentReply({ message: 'x', surfaceId: 'otra', updates: [{ path: '/a', value: 1 }] }, { activeSurfaceId: 's1' });
  assert.equal(stale.kind, 'surface', 'un patch a una superficie que no es la activa se vuelve superficie nueva');

  const alias = normalizeAgentReply({ message: 'x', surfaceId: 's1', dataModelUpdates: [{ path: '/a', value: 1 }] }, { activeSurfaceId: 's1' });
  assert.equal(alias.kind, 'patch');
});

test('normalizeAgentReply acota enums y coacciona números en componentes sin bindings', () => {
  const reply = normalizeAgentReply({
    message: 'm',
    ui: [
      { component: 'Alert', level: 'fatal', text: 'x' },
      { component: 'Kpi', label: 'a', value: 12, trend: 'sideways' },
      { component: 'Chart', chartType: 'dona', labels: ['a'], series: [{ data: ['1'] }] },
      { component: 'Kpi', label: 'b', value: { path: '/v' }, trend: 'sideways' },
    ],
  });
  const [, alert, kpi, chart, bound] = reply.surface.components;
  assert.equal(alert.level, 'info');
  assert.equal(kpi.value, '12');
  assert.equal(kpi.trend, 'neutral');
  assert.equal(chart.chartType, 'doughnut');
  assert.deepEqual(chart.datasets[0].data, [1]);
  assert.equal(bound.trend, 'sideways', 'con bindings no se toca: lo resuelve el cliente');
  assert.equal(reply.ui[0].level, 'info');
});

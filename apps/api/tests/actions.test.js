// La compuerta de confirmación: qué eventos de la interfaz autorizan una
// herramienta con efecto real (dinero o calendario) y cuáles no. Es la única
// pieza que puede poner `confirmed: true`, así que se prueba sola, sin MCP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_EVENTS, CONFIRMABLE_TOOLS, authorizedTools } from '../src/actions.js';

test('un turno de texto libre no autoriza ninguna herramienta', () => {
  assert.equal(authorizedTools({ userMessage: 'agenda todos mis pagos de tarjeta ya' }).size, 0);
});

test('las herramientas que escriben en el calendario requieren confirmación', () => {
  for (const tool of ['create_calendar_event', 'schedule_card_payments', 'update_calendar_event', 'delete_calendar_event']) {
    assert.ok(CONFIRMABLE_TOOLS.has(tool), `${tool} debería requerir confirmación`);
  }
  // Leer la agenda no requiere nada.
  for (const tool of ['list_calendar_events', 'check_calendar_availability', 'get_card_payment_schedule']) {
    assert.ok(!CONFIRMABLE_TOOLS.has(tool), `${tool} no debería requerir confirmación`);
  }
});

test('confirm_schedule_card_payments autoriza el agendado automático', () => {
  const authorized = authorizedTools({
    action: { event: { name: 'confirm_schedule_card_payments', context: { daysBefore: 3 } } },
  });
  assert.ok(authorized.has('schedule_card_payments'));
});

test('confirm_schedule_payment autoriza un pago personalizado con fecha válida', () => {
  const authorized = authorizedTools({
    action: { event: { name: 'confirm_schedule_payment', context: { summary: 'Pago renta', start: '2026-10-05', end: '2026-10-05' } } },
  });
  assert.ok(authorized.has('create_calendar_event'));
});

test('un contexto inválido no autoriza aunque el evento exista', () => {
  // Sin summary.
  assert.equal(authorizedTools({ action: { event: { name: 'confirm_schedule_payment', context: { start: '2026-10-05' } } } }).size, 0);
  // Fecha que no es una fecha.
  assert.equal(
    authorizedTools({ action: { event: { name: 'confirm_schedule_payment', context: { summary: 'x', start: 'mañana' } } } }).size,
    0,
  );
  // Anticipación fuera de rango.
  assert.equal(
    authorizedTools({ action: { event: { name: 'confirm_schedule_card_payments', context: { daysBefore: 400 } } } }).size,
    0,
  );
});

test('cada evento confirmable declara su herramienta y su esquema', () => {
  for (const [name, entry] of Object.entries(ACTION_EVENTS)) {
    if (!entry.confirms) continue;
    assert.ok(entry.tool, `${name} sin herramienta`);
    assert.ok(entry.schema, `${name} sin esquema de contexto`);
  }
});

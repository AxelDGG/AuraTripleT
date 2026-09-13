import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarTools } from '../src/calendarTools.js';

// Tarjetas de prueba: dos con fecha límite y una cuenta que no es crédito.
const bankingTools = {
  getAccounts: async () => [
    { id: 'ACC-003', type: 'credit', name: 'Tarjeta Oro', number: '1234', paymentDue: '2026-09-20', minimumPayment: 850 },
    { id: 'ACC-004', type: 'credit', name: 'Tarjeta Clásica', number: '5678', paymentDue: '2026-09-28', minimumPayment: 300 },
    { id: 'ACC-001', type: 'checking', name: 'Nómina', paymentDue: null },
  ],
};

// Sin GOOGLE_CLIENT_ID/SECRET el cliente de calendario es null; la lectura no
// depende de Google (regresión: `calendarClient()` sin await devolvía una
// promesa siempre truthy y la tool tronaba con "events of undefined").
const withoutGoogle = async (fn) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  try {
    return await fn();
  } finally {
    if (GOOGLE_CLIENT_ID !== undefined) process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    if (GOOGLE_CLIENT_SECRET !== undefined) process.env.GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
  }
};

test('getCardPaymentSchedule devuelve las fechas límite aunque Calendar no esté conectado', async () => {
  const result = await withoutGoogle(() =>
    createCalendarTools({ bankingTools }).getCardPaymentSchedule({ daysBefore: 3 }),
  );
  assert.equal(result.error, undefined);
  assert.equal(result.calendarConnected, false);
  assert.equal(result.daysBefore, 3);
  assert.equal(result.payments.length, 2);
  // El recordatorio se adelanta daysBefore días respecto a la fecha límite.
  assert.equal(result.payments[0].paymentDue, '2026-09-20');
  assert.equal(result.payments[0].reminderDate, '2026-09-17');
  assert.ok(result.payments.every((p) => p.scheduled === false && p.eventId === null));
});

test('getCardPaymentSchedule usa 1 día de anticipación por default', async () => {
  const tools = createCalendarTools({ bankingTools });
  const result = await withoutGoogle(() => tools.getCardPaymentSchedule());
  assert.equal(result.daysBefore, 1);
  assert.equal(result.payments[1].paymentDue, '2026-09-28');
  assert.equal(result.payments[1].reminderDate, '2026-09-27');
});

test('getCardPaymentSchedule avisa si no hay tools bancarias', async () => {
  const result = await createCalendarTools().getCardPaymentSchedule();
  assert.match(result.error, /herramientas bancarias/);
});

test('scheduleCardPayments no escribe sin Google configurado ni sin confirmación', async () => {
  const tools = createCalendarTools({ bankingTools });
  const result = await withoutGoogle(() => tools.scheduleCardPayments({ confirmed: true }));
  assert.match(result.error, /Google Calendar no está configurado/);
});

// Regresión: el modelo manda el campo vacío como null y `Number(null)` es 0
// (finito), así que el default se perdía y el recordatorio caía EL MISMO día
// del vencimiento en vez de un día antes.
test('getCardPaymentSchedule trata daysBefore null como "no lo dijo"', async () => {
  const tools = createCalendarTools({ bankingTools });
  for (const daysBefore of [null, undefined, '']) {
    const result = await withoutGoogle(() => tools.getCardPaymentSchedule({ daysBefore }));
    assert.equal(result.daysBefore, 1, `daysBefore ${JSON.stringify(daysBefore)}`);
    assert.equal(result.payments[0].reminderDate, '2026-09-19');
  }
});

// Los modelos mandan los números como texto de forma intermitente; el valor
// llega ya convertido desde el esquema de la tool, pero la tool tampoco debe
// depender de eso.
test('getCardPaymentSchedule acepta daysBefore numérico en texto', async () => {
  const tools = createCalendarTools({ bankingTools });
  const result = await withoutGoogle(() => tools.getCardPaymentSchedule({ daysBefore: '3' }));
  assert.equal(result.daysBefore, 3);
  assert.equal(result.payments[0].reminderDate, '2026-09-17');
});

test('getCardPaymentSchedule permite daysBefore 0 (recordatorio el mismo día)', async () => {
  const tools = createCalendarTools({ bankingTools });
  const result = await withoutGoogle(() => tools.getCardPaymentSchedule({ daysBefore: 0 }));
  assert.equal(result.daysBefore, 0);
  assert.equal(result.payments[0].reminderDate, '2026-09-20');
});

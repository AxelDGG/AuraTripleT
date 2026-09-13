// Prueba de integración: levanta el servidor MCP real por stdio,
// descubre herramientas y ejecuta llamadas de extremo a extremo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getMcpClient, listToolsForLlm, callMcpTool } from '../src/mcp-client.js';

after(async () => {
  const client = await getMcpClient();
  await client.close();
});

const CALENDAR_TOOLS = [
  'list_calendar_events', 'create_calendar_event', 'update_calendar_event', 'delete_calendar_event',
  'check_calendar_availability', 'get_card_payment_schedule', 'schedule_card_payments',
];

test('el servidor MCP expone las 18 herramientas bancarias', async () => {
  const tools = await listToolsForLlm();
  // Las de Google Calendar son otro contrato: se filtran por nombre exacto
  // porque dos de ellas (los recordatorios de tarjeta) no lo llevan en el nombre.
  const names = tools.map((t) => t.function.name).sort();
  const banking = names.filter((n) => !CALENDAR_TOOLS.includes(n));
  assert.deepEqual(banking, [
    'get_accounts', 'get_beneficiaries', 'get_customer_profile', 'get_exchange_rates',
    'get_investments', 'get_monthly_cashflow', 'get_recurring_payments', 'get_spending_by_category', 'get_spending_trend', 'get_portfolio',
    'get_portfolio_performance', 'get_watchlist',
    'get_transactions', 'list_credit_products', 'simulate_credit', 'transfer_funds',
    'get_card_restructure_options', 'restructure_card_debt',
  ].sort());
  assert.ok(tools.every((t) => t.type === 'function' && t.function.parameters));
});

test('el servidor MCP expone las herramientas de Google Calendar', async () => {
  const tools = await listToolsForLlm();
  const names = tools.map((t) => t.function.name);
  for (const name of CALENDAR_TOOLS) {
    assert.ok(names.includes(name), `falta la herramienta ${name}`);
  }
});

// Escribir en el calendario real pasa por la misma reja que el dinero: sin
// `confirmed` la herramienta no llega a Google.
test('create_calendar_event sin confirmación no escribe en el calendario', async () => {
  const raw = await callMcpTool('create_calendar_event', {
    summary: 'Prueba sin confirmar', start: '2026-12-01', end: '2026-12-01',
  });
  const result = JSON.parse(raw);
  assert.ok(result.error, 'debería devolver error');
  assert.equal(result.success, undefined);
});

// Regresión: el modelo mandaba daysBefore como "1" (texto) y el protocolo
// cortaba la llamada con "-32602 Input validation error", que la interfaz
// pintaba como un error del servicio de agenda con los datos intactos.
test('get_card_payment_schedule tolera el número en texto que manda el modelo', async () => {
  for (const daysBefore of ['3', 3]) {
    const result = JSON.parse(await callMcpTool('get_card_payment_schedule', { daysBefore }));
    assert.equal(result.error, undefined, `daysBefore ${JSON.stringify(daysBefore)}`);
    assert.equal(result.daysBefore, 3);
    assert.ok(Array.isArray(result.payments));
  }
});

// El campo vacío llega como null: cuenta como "no lo dijo" (default 1 día), no
// como 0, que dejaría el recordatorio el mismo día del vencimiento.
test('get_card_payment_schedule con daysBefore null usa el default de 1 día', async () => {
  const result = JSON.parse(await callMcpTool('get_card_payment_schedule', { daysBefore: null }));
  assert.equal(result.error, undefined);
  assert.equal(result.daysBefore, 1);
});

// Tolerar el tipo no es adivinar: un valor que no es un número sigue siendo un
// error de validación, no un default silencioso.
test('get_card_payment_schedule sigue rechazando un daysBefore que no es número', async () => {
  const raw = await callMcpTool('get_card_payment_schedule', { daysBefore: 'muchos' });
  assert.match(raw, /validation error/i);
});

// El esquema que ve el modelo no se relajó: se le sigue pidiendo un number.
test('el esquema de daysBefore sigue anunciando number al modelo', async () => {
  const tools = await listToolsForLlm();
  const { properties } = tools.find((t) => t.function.name === 'get_card_payment_schedule').function.parameters;
  const types = JSON.stringify(properties.daysBefore);
  assert.match(types, /"number"/);
  assert.doesNotMatch(types, /"string"/);
});

test('get_accounts vía MCP devuelve JSON con las cuentas', async () => {
  const raw = await callMcpTool('get_accounts', {});
  const accounts = JSON.parse(raw);
  assert.equal(accounts.length, 3);
  assert.equal(accounts[0].id, 'ACC-001');
});

test('simulate_credit vía MCP calcula una simulación válida', async () => {
  const raw = await callMcpTool('simulate_credit', { productId: 'CRED-PERS', amount: 80000, months: 24 });
  const sim = JSON.parse(raw);
  assert.equal(sim.error, undefined);
  assert.ok(sim.monthlyPayment > 0);
});

test('transfer_funds vía MCP ejecuta y persiste en la sesión del servidor', async () => {
  const raw = await callMcpTool('transfer_funds', {
    fromAccountId: 'ACC-001', toBeneficiaryId: 'BEN-02', amount: 500, concept: 'test e2e', confirmed: true,
  });
  const result = JSON.parse(raw);
  assert.equal(result.success, true);
  const txsRaw = await callMcpTool('get_transactions', { limit: 3 });
  const txs = JSON.parse(txsRaw);
  assert.ok(txs.some((t) => t.description.includes('Ana Sofía Torres')));
});

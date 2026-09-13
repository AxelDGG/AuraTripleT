// Prueba de integración: levanta el servidor MCP real por stdio,
// descubre herramientas y ejecuta llamadas de extremo a extremo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getMcpClient, listToolsForLlm, callMcpTool } from '../src/mcp-client.js';

after(async () => {
  const client = await getMcpClient();
  await client.close();
});

test('el servidor MCP expone las 17 herramientas bancarias', async () => {
  const tools = await listToolsForLlm();
  // Las de Google Calendar solo se registran si el .env trae la autorización:
  // no son parte del contrato bancario y dependen de la máquina.
  const names = tools.map((t) => t.function.name).filter((name) => !name.includes('calendar')).sort();
  assert.deepEqual(names, [
    'get_accounts', 'get_beneficiaries', 'get_customer_profile', 'get_exchange_rates',
    'get_investments', 'get_monthly_cashflow', 'get_spending_by_category', 'get_spending_trend', 'get_portfolio',
    'get_portfolio_performance', 'get_watchlist',
    'get_transactions', 'list_credit_products', 'simulate_credit', 'transfer_funds',
    'get_card_restructure_options', 'restructure_card_debt',
  ].sort());
  assert.ok(tools.every((t) => t.type === 'function' && t.function.parameters));
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

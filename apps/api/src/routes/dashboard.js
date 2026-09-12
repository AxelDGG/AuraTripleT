import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';

// Datos del dashboard: se obtienen en paralelo vía MCP (misma fuente que el agente).
const DASHBOARD_CALLS = [
  ['customer', 'get_customer_profile', {}],
  ['portfolio', 'get_portfolio', {}],
  ['watchlist', 'get_watchlist', { filter: 'most_viewed' }],
  ['performance', 'get_portfolio_performance', { range: 'ALL' }],
  ['accounts', 'get_accounts', {}],
  ['investments', 'get_investments', {}],
  ['spending', 'get_spending_by_category', {}],
  ['cashflow', 'get_monthly_cashflow', {}],
  ['exchangeRates', 'get_exchange_rates', {}],
  ['transactions', 'get_transactions', { limit: 12 }],
  ['creditProducts', 'list_credit_products', {}],
  ['beneficiaries', 'get_beneficiaries', {}],
];

export const dashboardRouter = Router();

dashboardRouter.get('/api/dashboard', async (_req, res) => {
  try {
    const entries = await Promise.all(
      DASHBOARD_CALLS.map(async ([key, tool, args]) => [key, JSON.parse(await callMcpTool(tool, args))]),
    );
    res.json({ ok: true, data: Object.fromEntries(entries), generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[dashboard] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el dashboard.' });
  }
});

// Servidor MCP de Banorte (transporte stdio).
// Expone las herramientas bancarias para que el agente las consuma vía protocolo MCP.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createBankState,
  getCustomerProfile,
  getAccounts,
  getTransactions,
  getSpendingByCategory,
  getMonthlyCashflow,
  getInvestments,
  getExchangeRates,
  getBeneficiaries,
  simulateCredit,
  listCreditProducts,
  transferFunds,
  getPortfolio,
  getWatchlist,
  getPortfolioPerformance,
} from './tools.js';

const state = createBankState();

const server = new McpServer({ name: 'banorte-banking', version: '1.0.0' });

function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

server.tool(
  'get_customer_profile',
  'Obtiene el perfil del cliente autenticado: nombre, segmento, score crediticio y datos de contacto.',
  {},
  async () => jsonResult(getCustomerProfile()),
);

server.tool(
  'get_accounts',
  'Lista las cuentas del cliente (nómina, ahorro y tarjeta de crédito) con saldos actuales.',
  {},
  async () => jsonResult(getAccounts(state)),
);

server.tool(
  'get_transactions',
  'Obtiene los movimientos recientes. Se puede filtrar por cuenta (accountId) o categoría.',
  {
    accountId: z.string().nullish().describe('ID de cuenta, ej. ACC-001'),
    category: z.string().nullish().describe('Categoría, ej. Restaurantes, Supermercado'),
    limit: z.number().nullish().describe('Máximo de movimientos a devolver (default 15)'),
  },
  async (args) => jsonResult(getTransactions(state, args)),
);

server.tool(
  'get_spending_by_category',
  'Resume los gastos agrupados por categoría (para gráficas de análisis de gastos).',
  {
    accountId: z.string().nullish().describe('Limitar a una cuenta específica'),
  },
  async (args) => jsonResult(getSpendingByCategory(state, args)),
);

server.tool(
  'get_monthly_cashflow',
  'Devuelve ingresos vs gastos por mes (para gráficas de flujo de efectivo).',
  {},
  async () => jsonResult(getMonthlyCashflow(state)),
);

server.tool(
  'get_investments',
  'Lista las inversiones del cliente (pagarés y fondos) con rendimiento.',
  {},
  async () => jsonResult(getInvestments()),
);

server.tool(
  'get_exchange_rates',
  'Tipos de cambio del día (compra/venta) para USD, EUR, CAD y JPY.',
  {},
  async () => jsonResult(getExchangeRates()),
);

server.tool(
  'get_beneficiaries',
  'Lista los beneficiarios registrados para transferencias SPEI.',
  {},
  async () => jsonResult(getBeneficiaries()),
);

server.tool(
  'list_credit_products',
  'Lista los productos de crédito disponibles (automotriz, hipotecario, personal) con tasas y plazos.',
  {},
  async () => jsonResult(listCreditProducts()),
);

server.tool(
  'simulate_credit',
  'Simula un crédito: calcula tasa, pago mensual e intereses totales.',
  {
    productId: z.string().describe('CRED-AUTO, CRED-HIPO o CRED-PERS'),
    amount: z.number().describe('Monto solicitado en MXN'),
    months: z.number().describe('Plazo en meses'),
  },
  async (args) => jsonResult(simulateCredit(args)),
);

server.tool(
  'transfer_funds',
  'Ejecuta una transferencia SPEI simulada desde una cuenta propia hacia un beneficiario o cuenta propia. Requiere confirmación previa del usuario.',
  {
    fromAccountId: z.string().describe('Cuenta origen, ej. ACC-001'),
    toBeneficiaryId: z.string().nullish().describe('Beneficiario destino, ej. BEN-01'),
    toAccountId: z.string().nullish().describe('Cuenta propia destino, ej. ACC-002'),
    amount: z.number().describe('Monto en MXN'),
    concept: z.string().nullish().describe('Concepto del pago'),
    confirmed: z.boolean().nullish().describe('Lo establece el sistema cuando el usuario confirma desde el formulario; no lo inventes'),
  },
  async (args) => jsonResult(transferFunds(state, args)),
);

server.tool(
  'get_portfolio',
  'Portafolio bursátil del cliente en USD: posiciones (AAPL, AMZN, MSFT, NVDA), valor total, variación del día y distribución.',
  {},
  async () => jsonResult(getPortfolio()),
);

server.tool(
  'get_watchlist',
  'Lista de seguimiento de acciones con precio, variación y mini-serie. filter: most_viewed (default), gain o lose.',
  {
    filter: z.string().nullish().describe('most_viewed | gain | lose'),
  },
  async (args) => jsonResult(getWatchlist(args)),
);

server.tool(
  'get_portfolio_performance',
  'Serie histórica del valor del portafolio para gráficas. range: 1D, 1W, 1M, 6M, 1Y (default) o ALL para todas.',
  {
    range: z.string().nullish().describe('1D | 1W | 1M | 6M | 1Y | ALL'),
  },
  async (args) => jsonResult(getPortfolioPerformance(args)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[MCP] Servidor banorte-banking listo (stdio)');

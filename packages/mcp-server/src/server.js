// Servidor MCP de Banorte (transporte stdio).
// Expone las herramientas bancarias para que el agente las consuma vía protocolo MCP.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import { createRepository } from './repositories/index.js';
import { createBankingTools } from './tools.js';
import { getAuthorizedClient, isGoogleConfigured } from './google/auth.js';
import { createCalendarTools } from './calendarTools.js';

// Si el proceso ya trae el .env cargado (p.ej. lanzado por apps/api) esto no
// pisa nada; permite además correr este server solo (`npm run mcp`) o el
// script de autorización de Google sin depender de quién lo invoque.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

// Fuente de datos según BANK_DATA_SOURCE (memory por defecto); cada proceso
// del servidor tiene su propio estado.
const tools = createBankingTools(createRepository());
const calendarTools = createCalendarTools();

const server = new McpServer({ name: 'banorte-banking', version: '1.0.0' });

function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

server.tool(
  'get_customer_profile',
  'Obtiene el perfil del cliente autenticado: nombre, segmento, score crediticio y datos de contacto.',
  {},
  async () => jsonResult(await tools.getCustomerProfile()),
);

server.tool(
  'get_accounts',
  'Lista las cuentas del cliente (nómina, ahorro y tarjeta de crédito) con saldos actuales.',
  {},
  async () => jsonResult(await tools.getAccounts()),
);

server.tool(
  'get_transactions',
  'Obtiene los movimientos recientes. Se puede filtrar por cuenta (accountId) o categoría.',
  {
    accountId: z.string().nullish().describe('ID de cuenta, ej. ACC-001'),
    category: z.string().nullish().describe('Categoría, ej. Restaurantes, Supermercado'),
    limit: z.number().nullish().describe('Máximo de movimientos a devolver (default 15)'),
  },
  async (args) => jsonResult(await tools.getTransactions(args)),
);

server.tool(
  'get_spending_by_category',
  'Resume los gastos agrupados por categoría (para gráficas de análisis de gastos).',
  {
    accountId: z.string().nullish().describe('Limitar a una cuenta específica'),
  },
  async (args) => jsonResult(await tools.getSpendingByCategory(args)),
);

server.tool(
  'get_monthly_cashflow',
  'Devuelve ingresos vs gastos por mes (para gráficas de flujo de efectivo).',
  {},
  async () => jsonResult(await tools.getMonthlyCashflow()),
);

server.tool(
  'get_investments',
  'Lista las inversiones del cliente (pagarés y fondos) con rendimiento.',
  {},
  async () => jsonResult(await tools.getInvestments()),
);

server.tool(
  'get_exchange_rates',
  'Tipos de cambio del día (compra/venta) para USD, EUR, CAD y JPY.',
  {},
  async () => jsonResult(await tools.getExchangeRates()),
);

server.tool(
  'get_beneficiaries',
  'Lista los beneficiarios registrados para transferencias SPEI.',
  {},
  async () => jsonResult(await tools.getBeneficiaries()),
);

server.tool(
  'list_credit_products',
  'Lista los productos de crédito disponibles (automotriz, hipotecario, personal) con tasas y plazos.',
  {},
  async () => jsonResult(await tools.listCreditProducts()),
);

server.tool(
  'simulate_credit',
  'Simula un crédito: calcula tasa, pago mensual e intereses totales.',
  {
    productId: z.string().describe('CRED-AUTO, CRED-HIPO o CRED-PERS'),
    amount: z.number().describe('Monto solicitado en MXN'),
    months: z.number().describe('Plazo en meses'),
  },
  async (args) => jsonResult(await tools.simulateCredit(args)),
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
  async (args) => jsonResult(await tools.transferFunds(args)),
);

server.tool(
  'get_card_restructure_options',
  'Opciones para reestructurar el saldo de la tarjeta de crédito en un plan de pagos fijos a tasa preferente: saldo, tasa actual, tasa del plan y, por cada plazo (6, 12, 18, 24, 36 meses), mensualidad, intereses totales y ahorro contra la tasa de la tarjeta.',
  {
    accountId: z.string().nullish().describe('Tarjeta, ej. ACC-003. Si se omite se usa la primera tarjeta del cliente'),
  },
  async (args) => jsonResult(await tools.getCardRestructureOptions(args)),
);

server.tool(
  'restructure_card_debt',
  'Aplica la reestructura del saldo de la tarjeta al plazo elegido (simulada). Requiere confirmación previa del usuario desde el botón "Aplicar plan".',
  {
    accountId: z.string().nullish().describe('Tarjeta, ej. ACC-003'),
    months: z.number().describe('Plazo elegido: 6, 12, 18, 24 o 36'),
    confirmed: z.boolean().nullish().describe('Lo establece el sistema cuando el usuario confirma desde el botón; no lo inventes'),
  },
  async (args) => jsonResult(await tools.restructureCardDebt(args)),
);

server.tool(
  'get_portfolio',
  'Portafolio bursátil del cliente en USD: posiciones (AAPL, AMZN, MSFT, NVDA), valor total, variación del día y distribución.',
  {},
  async () => jsonResult(await tools.getPortfolio()),
);

server.tool(
  'get_watchlist',
  'Lista de seguimiento de acciones con precio, variación y mini-serie. filter: most_viewed (default), gain o lose.',
  {
    filter: z.string().nullish().describe('most_viewed | gain | lose'),
  },
  async (args) => jsonResult(await tools.getWatchlist(args)),
);

server.tool(
  'get_portfolio_performance',
  'Serie histórica del valor del portafolio para gráficas. range: 1D, 1W, 1M, 6M, 1Y (default) o ALL para todas.',
  {
    range: z.string().nullish().describe('1D | 1W | 1M | 6M | 1Y | ALL'),
  },
  async (args) => jsonResult(await tools.getPortfolioPerformance(args)),
);

server.tool(
  'list_calendar_events',
  'Lista los próximos eventos del Google Calendar del cliente (por ejemplo, citas con un asesor Banorte). Requiere Google Calendar autorizado.',
  {
    calendarId: z.string().nullish().describe('ID del calendario, default "primary"'),
    timeMin: z.string().nullish().describe('ISO 8601, default ahora'),
    timeMax: z.string().nullish().describe('ISO 8601, opcional'),
    query: z.string().nullish().describe('Texto libre para filtrar eventos'),
    maxResults: z.number().nullish().describe('Máximo de eventos a devolver (default 10)'),
  },
  async (args) => jsonResult(await calendarTools.listEvents(args)),
);

server.tool(
  'create_calendar_event',
  'Crea un evento en Google Calendar, por ejemplo para agendar una cita con un asesor Banorte. start/end en ISO 8601 (ej. 2026-03-05T10:00:00-06:00) o YYYY-MM-DD para todo el día.',
  {
    calendarId: z.string().nullish().describe('ID del calendario, default "primary"'),
    summary: z.string().describe('Título del evento'),
    description: z.string().nullish(),
    location: z.string().nullish(),
    start: z.string().describe('Inicio en ISO 8601 o YYYY-MM-DD'),
    end: z.string().describe('Fin en ISO 8601 o YYYY-MM-DD'),
    timeZone: z.string().nullish().describe('Default America/Mexico_City'),
    attendees: z.array(z.string()).nullish().describe('Correos de invitados'),
  },
  async (args) => jsonResult(await calendarTools.createEvent(args)),
);

server.tool(
  'update_calendar_event',
  'Modifica un evento existente de Google Calendar. Solo se actualizan los campos enviados.',
  {
    calendarId: z.string().nullish().describe('ID del calendario, default "primary"'),
    eventId: z.string().describe('ID del evento a modificar'),
    summary: z.string().nullish(),
    description: z.string().nullish(),
    location: z.string().nullish(),
    start: z.string().nullish().describe('ISO 8601 o YYYY-MM-DD'),
    end: z.string().nullish().describe('ISO 8601 o YYYY-MM-DD'),
    timeZone: z.string().nullish(),
  },
  async (args) => jsonResult(await calendarTools.updateEvent(args)),
);

server.tool(
  'delete_calendar_event',
  'Elimina un evento de Google Calendar por su ID.',
  {
    calendarId: z.string().nullish().describe('ID del calendario, default "primary"'),
    eventId: z.string().describe('ID del evento a eliminar'),
  },
  async (args) => jsonResult(await calendarTools.deleteEvent(args)),
);

server.tool(
  'check_calendar_availability',
  'Revisa si el cliente tiene tiempo libre en un rango (freebusy), útil antes de proponer un horario de cita.',
  {
    calendarId: z.string().nullish().describe('ID del calendario, default "primary"'),
    timeMin: z.string().describe('Inicio del rango, ISO 8601'),
    timeMax: z.string().describe('Fin del rango, ISO 8601'),
  },
  async (args) => jsonResult(await calendarTools.checkAvailability(args)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[MCP] Servidor banorte-banking listo (stdio)');

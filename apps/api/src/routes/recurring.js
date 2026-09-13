// GET /api/recurring-payments — los pagos fijos del cliente, sin pasar por el LLM.
//
// Es una sola llamada MCP a `get_recurring_payments`: el patrón mensual ya lo
// resuelve la base (Tiger) y la tool le pone la próxima fecha. La ruta existe
// para que la portada y la app móvil puedan pintar "lo que se te viene" sin
// gastar un turno del agente.

import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';

export const recurringRouter = Router();

const positiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

recurringRouter.get('/api/recurring-payments', async (req, res) => {
  try {
    const data = JSON.parse(
      await callMcpTool('get_recurring_payments', {
        accountId: req.query.accountId ?? null,
        months: positiveInt(req.query.months),
      }),
    );
    res.json({ ok: true, data, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[recurring-payments] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudieron calcular tus pagos fijos.' });
  }
});

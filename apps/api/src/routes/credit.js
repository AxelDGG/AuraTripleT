import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';

const MAX_PRODUCT_ID_CHARS = 20;

export const creditRouter = Router();

creditRouter.post('/api/simulate-credit', async (req, res) => {
  const { productId, amount, months } = req.body ?? {};
  const amountNumber = Number(amount);
  const monthsNumber = Number(months);
  if (typeof productId !== 'string' || !Number.isFinite(amountNumber) || !Number.isFinite(monthsNumber)) {
    res.status(400).json({ ok: false, error: 'productId, amount y months son requeridos.' });
    return;
  }
  try {
    const result = JSON.parse(await callMcpTool('simulate_credit', {
      productId: productId.slice(0, MAX_PRODUCT_ID_CHARS),
      amount: amountNumber,
      months: Math.round(monthsNumber),
    }));
    res.json({ ok: !result.error, data: result.error ? null : result, error: result.error ?? null });
  } catch (err) {
    console.error('[simulate-credit] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo simular el crédito.' });
  }
});

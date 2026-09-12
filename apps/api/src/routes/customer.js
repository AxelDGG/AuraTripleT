// GET /api/customer — perfil del cliente en una sola llamada MCP.
//
// La web solo necesita el nombre y el segmento para la franja de estado; pedir
// /api/dashboard (12 herramientas) para eso sería desperdiciar el arranque.

import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';

export const customerRouter = Router();

customerRouter.get('/api/customer', async (_req, res) => {
  try {
    const profile = JSON.parse(await callMcpTool('get_customer_profile', {}));
    res.json({ ok: true, data: profile });
  } catch (err) {
    console.error('[customer] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el perfil del cliente.' });
  }
});

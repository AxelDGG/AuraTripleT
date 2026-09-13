// GET /api/customer — perfil del cliente en una sola llamada MCP.
//
// La web solo necesita el nombre y el segmento para la franja de estado; pedir
// /api/dashboard (12 herramientas) para eso sería desperdiciar el arranque.

import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';

export const customerRouter = Router();

// Con sesión activa se agregan el nombre con el que la app saluda y el último
// ingreso; sin sesión la respuesta es exactamente la de antes, que es lo que
// mantiene viva a cualquier pantalla que todavía consulte esta ruta anónima.
customerRouter.get('/api/customer', async (req, res) => {
  try {
    const profile = JSON.parse(await callMcpTool('get_customer_profile', {}));
    const session = req.session?.user;
    const data = session
      ? { ...profile, preferredName: session.preferredName, lastLogin: session.lastLogin, username: session.username }
      : profile;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[customer] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el perfil del cliente.' });
  }
});

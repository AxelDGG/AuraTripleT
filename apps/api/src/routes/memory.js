// GET /api/memory y DELETE /api/memory/:id: lo que Norte recuerda de la persona.
//
// Transparencia sobre la memoria del agente: la app puede mostrar la lista y
// dejar que la persona borre lo que no quiera que se use. El cliente es el de
// la sesión; sin sesión, el de la demo (igual que el historial).

import { Router } from 'express';
import { customerIdFor } from '../middleware/auth.js';
import { DEMO_CUSTOMER_ID } from '../history-store.js';

export function createMemoryRouter({ memoryStore }) {
  const router = Router();
  const customerOf = (req) => customerIdFor(req) ?? DEMO_CUSTOMER_ID;

  router.get('/api/memory', async (req, res, next) => {
    if (!memoryStore) {
      res.json({ enabled: false, kind: null, semantic: false, memories: [] });
      return;
    }
    try {
      const memories = await memoryStore.list({ customerId: customerOf(req), limit: req.query.limit });
      res.json({ enabled: true, kind: memoryStore.kind, semantic: memoryStore.semantic, memories });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/memory/:id', async (req, res, next) => {
    if (!memoryStore) {
      res.status(404).json({ error: 'La memoria del agente está desactivada.' });
      return;
    }
    try {
      const forgotten = await memoryStore.forget({ customerId: customerOf(req), id: req.params.id });
      if (!forgotten) {
        res.status(404).json({ error: 'No existe esa memoria.' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

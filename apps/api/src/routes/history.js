// GET /api/history — historial de visualizaciones generadas por el agente.
//
// Alimenta el carrusel central (últimas interfaces) y el panel derecho de
// carpetas. Filtros opcionales: ?folder=gastos, ?search=texto, ?limit=30.

import { Router } from 'express';
import { FOLDERS, FOLDER_IDS } from '@norte/a2ui-schema';

const MAX_SEARCH_CHARS = 120;

export function createHistoryRouter({ historyStore }) {
  const router = Router();

  router.get('/api/history', async (req, res, next) => {
    try {
      // Una carpeta desconocida devuelve 400 en vez de caer en `otros` en
      // silencio: aquí el cliente es nuestro y un id inválido es un bug, no una
      // salida creativa del modelo.
      const folder = req.query.folder ? String(req.query.folder) : undefined;
      if (folder && !FOLDER_IDS.includes(folder)) {
        res.status(400).json({ error: `Carpeta desconocida: "${folder}". Opciones: ${FOLDER_IDS.join(', ')}.` });
        return;
      }
      const search = req.query.search ? String(req.query.search).slice(0, MAX_SEARCH_CHARS).trim() : undefined;

      const [entries, counts] = await Promise.all([
        historyStore.list({ folder, search: search || undefined, limit: req.query.limit }),
        historyStore.counts(),
      ]);

      res.json({
        source: historyStore.kind,
        folders: FOLDERS.map((f) => ({ id: f.id, label: f.label, total: counts[f.id] ?? 0 })),
        entries,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

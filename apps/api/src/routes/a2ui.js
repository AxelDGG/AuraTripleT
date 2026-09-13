// GET /api/a2ui/catalog — el catálogo de componentes que este servidor sabe
// pedir (lo que A2UI llama catalogId). Un cliente lo compara con lo que él
// sabe pintar y anuncia la intersección en cada petición al agente.

import { Router } from 'express';
import { RENDERER_FUNCTION_NAMES, catalogDescriptor } from '@norte/a2ui-schema';

export const a2uiRouter = Router();

a2uiRouter.get('/api/a2ui/catalog', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(catalogDescriptor({ functions: RENDERER_FUNCTION_NAMES }));
});

// Manejador de errores final: nunca exponer stack traces al cliente.

const CLIENT_ERROR_TYPES = new Set(['entity.parse.failed', 'entity.too.large']);

// eslint-disable-next-line no-unused-vars -- Express identifica el manejador de errores por su aridad (4).
export function errorHandler(err, _req, res, _next) {
  console.error('[http] error:', err.message);
  const status = CLIENT_ERROR_TYPES.has(err.type) ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Solicitud inválida.' : 'Error interno del servidor.' });
}

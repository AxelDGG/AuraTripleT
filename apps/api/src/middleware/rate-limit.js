// Rate limiting simple en memoria por IP (ventana deslizante).
// Suficiente para la demo; con varias instancias habría que moverlo a un store compartido.

const DEFAULT_WINDOW_MS = 60_000;

export function createRateLimiter(maxRequests, { windowMs = DEFAULT_WINDOW_MS } = {}) {
  const requestLog = new Map();

  const prune = (now) => {
    for (const [ip, times] of requestLog) {
      const alive = times.filter((t) => now - t < windowMs);
      if (alive.length) requestLog.set(ip, alive);
      else requestLog.delete(ip);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    prune(now);
    const ip = req.ip ?? 'unknown';
    const recent = requestLog.get(ip) ?? [];
    if (recent.length >= maxRequests) {
      res.status(429).json({ ok: false, error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' });
      return;
    }
    requestLog.set(ip, [...recent, now]);
    next();
  };
}

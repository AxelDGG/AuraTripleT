// Middleware de sesión.
//
// `attachSession` es deliberadamente permisivo: si viene un Bearer válido deja
// la sesión en `req.session`, y si no, deja pasar. La web y la app móvil mandan
// token siempre, pero /api/health y el propio login tienen que responder sin él.
//
// `requireSession` es el candado para lo que sí exige identidad (/api/overview,
// /api/auth/session). Con AUTH_REQUIRED=true se endurece toda la API.

import { verifyToken } from '../auth/tokens.js';
import { findUserById, publicUser } from '../auth/users.js';

const bearer = (req) => {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

export function attachSession(req, _res, next) {
  const token = bearer(req);
  if (token) {
    const claims = verifyToken(token);
    const user = claims ? findUserById(claims.sub) : null;
    if (user) req.session = { user: publicUser(user), claims };
  }
  next();
}

export function requireSession(req, res, next) {
  if (req.session) return next();
  res.status(401).json({ ok: false, error: 'Sesión requerida.' });
}

// Candado global opcional: deja pasar los estáticos, el health y el propio
// login, y exige token en el resto de /api.
export function enforceAuthIfConfigured(req, res, next) {
  if (process.env.AUTH_REQUIRED !== 'true') return next();
  if (!req.path.startsWith('/api')) return next();
  if (req.path === '/api/health' || req.path.startsWith('/api/auth/')) return next();
  return requireSession(req, res, next);
}

// El cliente al que se atribuye lo que se genere en esta petición.
export function customerIdFor(req) {
  return req.session?.user.customerId;
}

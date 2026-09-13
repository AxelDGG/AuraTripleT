// Rutas de sesión: login, sesión actual y logout.
//
// La app móvil hace login una sola vez, guarda el token en el llavero del
// sistema y a partir de ahí lo desbloquea con huella o Face ID en el
// dispositivo. La biometría NO viaja al servidor: el sistema operativo dice sí
// o no, y solo entonces la app lee el token que ya tenía guardado. Eso es lo
// que hace un banco de verdad y evita inventar un protocolo biométrico propio.

import { Router } from 'express';
import { issueToken } from '../auth/tokens.js';
import { verifyCredentials, publicUser, recordLogin } from '../auth/users.js';
import { requireSession } from '../middleware/auth.js';

const MAX_FIELD_CHARS = 120;
const ALLOWED_CHANNELS = new Set(['mobile', 'web', 'widget']);

// Retraso fijo ante credenciales inválidas: encarece probar contraseñas a
// ciegas sin que el tiempo de respuesta revele si el usuario existe.
const FAILED_LOGIN_DELAY_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clean = (value) => (typeof value === 'string' ? value.slice(0, MAX_FIELD_CHARS) : '');

export const authRouter = Router();

// POST /api/auth/login  { username, password, channel? }
// → { ok, token, expiresAt, user }
// El `try/catch` no es decorativo: en Express 4 un throw dentro de un handler
// `async` no llega al manejador de errores, se queda como promesa rechazada y
// la petición nunca recibe respuesta. Un login que cuelga es peor que uno que
// falla — el cliente se queda esperando sin nada que reintentar ni que mostrar.
authRouter.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = clean(req.body?.username).trim().toLowerCase();
    const password = clean(req.body?.password);
    const channel = ALLOWED_CHANNELS.has(req.body?.channel) ? req.body.channel : 'web';

    if (!username || !password) {
      res.status(400).json({ ok: false, error: 'Usuario y contraseña son requeridos.' });
      return;
    }

    const user = await verifyCredentials(username, password);
    if (!user) {
      await wait(FAILED_LOGIN_DELAY_MS);
      res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    // El "último ingreso" que ve la persona es el anterior a este, no el de ahora.
    const previousLogin = recordLogin(user.id, channel);
    const { token, expiresAt } = issueToken({ sub: user.id, cid: user.customerId, ch: channel });

    res.json({ ok: true, token, expiresAt, user: publicUser(user, previousLogin) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/session — valida el token guardado y devuelve al usuario.
// La app la llama al abrir para saber si la sesión sigue viva antes de pedir biometría.
authRouter.get('/api/auth/session', requireSession, (req, res) => {
  res.json({ ok: true, user: req.session.user, expiresAt: new Date(req.session.claims.exp * 1000).toISOString() });
});

// POST /api/auth/logout — la sesión no tiene estado en el servidor, así que
// esto solo confirma; quien borra el token es el cliente.
authRouter.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true });
});

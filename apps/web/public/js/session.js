// Sesión del navegador: el token que emite /api/auth/login y el usuario que
// viene con él.
//
// La app móvil guarda su token en el llavero del sistema; el navegador no tiene
// uno, así que vive en localStorage. Tradeoff registrado: un XSS podría leerlo.
// Lo que lo contiene es la CSP (`script-src 'self'`): en esta web no corre
// ningún script que no hayamos servido nosotros.
//
// El token es opaco para el cliente. Lo único que se mira aquí es `expiresAt`,
// y solo para no mandar peticiones que ya sabemos que la API va a rechazar.
(function () {
  const KEY = 'norte.session';
  const LOGIN_URL = '/login';
  const HOME_URL = '/inicio';

  let cached;

  function read() {
    if (cached !== undefined) return cached;
    try {
      const raw = localStorage.getItem(KEY);
      const session = raw ? JSON.parse(raw) : null;
      cached = session?.token ? session : null;
    } catch {
      // localStorage bloqueado o JSON corrupto: se trata como "sin sesión".
      cached = null;
    }
    if (cached?.expiresAt && Date.parse(cached.expiresAt) <= Date.now()) clear();
    return cached;
  }

  function save({ token, user, expiresAt }) {
    cached = { token, user, expiresAt };
    try {
      localStorage.setItem(KEY, JSON.stringify(cached));
    } catch {
      // Sin almacenamiento la sesión dura lo que la pestaña. Vale más eso que
      // romper el login.
    }
    return cached;
  }

  function clear() {
    cached = null;
    try { localStorage.removeItem(KEY); } catch { /* nada que borrar */ }
  }

  const token = () => read()?.token ?? null;
  const user = () => read()?.user ?? null;

  // Cabeceras de una petición autenticada. Sin sesión devuelve las de entrada
  // tal cual: las rutas públicas siguen funcionando igual.
  function headers(extra = {}) {
    const value = token();
    return value ? { ...extra, Authorization: `Bearer ${value}` } : { ...extra };
  }

  // A dónde volver después de entrar: se guarda la ruta actual para no perderla.
  function goToLogin() {
    const next = window.location.pathname + window.location.search;
    const query = next && next !== LOGIN_URL ? `?next=${encodeURIComponent(next)}` : '';
    window.location.replace(`${LOGIN_URL}${query}`);
  }

  // Candado de las páginas privadas. Devuelve la sesión, o redirige y devuelve
  // null para que quien llama corte su arranque.
  function requireSession() {
    const session = read();
    if (!session) {
      goToLogin();
      return null;
    }
    return session;
  }

  // La API dijo 401: el token ya no sirve, venga de donde venga.
  function expired() {
    clear();
    goToLogin();
  }

  async function signOut() {
    const value = token();
    if (value) {
      // El logout del servidor no tiene estado que borrar, pero se avisa igual
      // por si algún día lo tiene. Que falle no debe impedir salir.
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${value}` },
      }).catch(() => {});
    }
    clear();
    window.location.replace(LOGIN_URL);
  }

  window.Session = { read, save, clear, token, user, headers, requireSession, expired, signOut, LOGIN_URL, HOME_URL };
})();

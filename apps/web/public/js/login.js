// Pantalla de acceso. Habla directo con /api/auth/login: es la única petición
// de la web que no lleva token, porque es la que lo consigue.
(function () {
  const $ = (id) => document.getElementById(id);
  const LOGIN_TIMEOUT_MS = 15000;

  // A dónde ir después de entrar. Solo se aceptan rutas internas: un `next`
  // con host propio convertiría el login en un trampolín a cualquier sitio.
  function nextUrl() {
    const wanted = new URLSearchParams(window.location.search).get('next');
    return wanted && wanted.startsWith('/') && !wanted.startsWith('//') ? wanted : window.Session.HOME_URL;
  }

  function showError(message) {
    const node = $('loginError');
    node.textContent = message;
    node.hidden = !message;
  }

  function setBusy(busy) {
    const button = $('loginSubmit');
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    $('username').disabled = busy;
    $('password').disabled = busy;
  }

  async function login(username, password) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, channel: 'web' }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const { t } = window.I18N;
    const username = $('username').value.trim();
    const password = $('password').value;

    if (!username || !password) {
      showError(t('auth.error.empty'));
      (username ? $('password') : $('username')).focus();
      return;
    }

    showError('');
    setBusy(true);
    try {
      const { token, user, expiresAt } = await login(username, password);
      window.Session.save({ token, user, expiresAt });
      window.location.replace(nextUrl());
    } catch (err) {
      // El mensaje del servidor ya está en español y no revela si el usuario
      // existe; solo se traduce el caso de red caída.
      const offline = err.name === 'AbortError' || err.message.startsWith('Failed to fetch');
      showError(offline ? t('auth.error.network') : err.message);
      $('password').value = '';
      $('password').focus();
      setBusy(false);
    }
  }

  function wireReveal() {
    const button = $('revealBtn');
    button.addEventListener('click', () => {
      const input = $('password');
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!shown));
      button.replaceChildren(window.ICONS.el(shown ? 'eye' : 'eyeOff'));
      input.focus();
    });
  }

  function boot() {
    window.ICONS.fill();
    window.I18N.apply();

    // Con sesión viva no tiene sentido pedir la contraseña otra vez.
    if (window.Session.read()) {
      window.location.replace(nextUrl());
      return;
    }

    document.getElementById('app').classList.add('is-ready');
    $('loginForm').addEventListener('submit', onSubmit);
    wireReveal();

    const { t } = window.I18N;
    $('locationBtn').addEventListener('click', () => window.UI.toast(t('top.location.toast')));
    $('contactBtn').addEventListener('click', () => window.UI.toast(t('top.contact.toast')));
    $('forgotBtn').addEventListener('click', () => window.UI.toast(t('auth.forgot.toast')));
    $('registerBtn').addEventListener('click', () => window.UI.toast(t('auth.register.toast')));

    $('username').focus();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

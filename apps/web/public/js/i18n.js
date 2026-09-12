// Textos de la interfaz y utilidades de formato.
//
// La app es una demo para México y el agente responde en español mexicano por
// prompt, así que aquí solo vive el diccionario ES. La forma del módulo (t/apply)
// es la misma que tendría con varios idiomas: agregar uno sería sumar un
// diccionario y cambiar `lang`.
(function () {
  const LANG = 'es';
  const LOCALE = 'es-MX';

  const DICT = {
    'top.location': 'UBICACIÓN',
    'top.contact': 'CONTACTO',
    'top.exit': 'SALIR',

    'state.connecting': 'Conectando con el agente…',
    'state.ready': 'Agente listo',
    'state.busy': 'Trabajando…',
    'state.offline': 'Agente sin conexión',

    'history.title': 'HISTORIAL DE VISUALIZACIÓN FINANCIERA INTELIGENTE',
    'carousel.prev': 'Ver anteriores',
    'carousel.next': 'Ver siguientes',
    'carousel.empty': 'Todavía no hay visualizaciones. Pídele algo al agente y aparecerán aquí.',
    'carousel.loading': 'Cargando historial…',

    'composer.placeholder': 'Escribe o habla con el agente Banorte…',
    'composer.send': 'Enviar',
    'composer.mic': 'Dictar por voz',

    'rail.search': 'BUSCAR POR TITULO',
    'rail.clear': 'Limpiar búsqueda',
    'rail.noResults': 'Sin resultados para "{q}"',
    'folder.empty': 'Esta carpeta todavía está vacía',
    'folder.ofTotal': 'Coincidencias · {total} en total',

    'canvas.title': '¿Qué quieres ver hoy?',
    'canvas.text': 'El agente consulta tus datos bancarios con herramientas MCP, construye la interfaz al instante y la archiva en la carpeta que mejor le corresponde.',

    'agent.thinking': 'Pensando…',
    'agent.tool': 'Consultando {tool}…',
    'agent.timeout': 'La solicitud tardó demasiado. Intenta de nuevo.',
    'agent.error': 'Error de conexión: {msg}',
    'agent.noResponse': 'El agente no devolvió una respuesta.',
    'agent.saved': 'Guardado en {folder}',
    'agent.formSent': 'Formulario enviado: {payload}',

    'overlay.close': 'Cerrar',
    'error.history': 'No se pudo cargar el historial.',
    'error.retry': 'Reintentar',

    'exit.confirm': 'Sesión cerrada (demo).',
    'top.location.toast': 'Sucursal más cercana: Monterrey Centro.',
    'top.contact.toast': 'Atención Banorte: 800 BANORTE (800 226 6783).',

    'chip.spending': '📊 ¿En qué estoy gastando más?',
    'chip.accounts': '🏦 Saldo de mis cuentas',
    'chip.transfer': '💸 Hacer una transferencia',
    'chip.credit': '🚗 Simular un crédito automotriz',
    'chip.card': '🧾 Estado de mi tarjeta',
    'chip.fx': '💱 Tipo de cambio de hoy',

    'prompt.spending': '¿En qué estoy gastando más? Muéstrame una gráfica de gastos por categoría y las principales.',
    'prompt.accounts': 'Muéstrame el saldo de todas mis cuentas con sus detalles.',
    'prompt.transfer': 'Quiero hacer una transferencia',
    'prompt.credit': 'Simula un crédito automotriz de 350000 pesos a 48 meses',
    'prompt.card': '¿Cuánto debo de mi tarjeta de crédito y cuándo tengo que pagar?',
    'prompt.fx': 'Muéstrame el tipo de cambio de hoy',

    'voice.denied': 'Permite el acceso al micrófono en tu navegador para dictar.',
    'voice.noSpeech': 'No se detectó voz. Intenta de nuevo.',
    'voice.noMic': 'No se encontró un micrófono.',
    'voice.unsupported': 'Tu navegador no soporta dictado por voz (usa Chrome o Edge).',
    'voice.network': 'El reconocimiento de voz necesita conexión a internet.',
    'voice.error': 'No se pudo usar el micrófono.',
    'voice.listening': 'Escuchando… habla ahora',
  };

  // t('agent.tool', { tool: 'get_accounts' }) → 'Consultando get_accounts…'
  function t(key, vars) {
    const text = DICT[key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  }

  // Rellena los marcadores declarativos del HTML.
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  }

  const fmtMoney = (n) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'MXN' }).format(n);

  // Fecha de una tarjeta del historial: relativa mientras sea reciente ("hace
  // 5 min"), absoluta en cuanto deja de serlo.
  const RELATIVE = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const UNITS = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 7],
  ];

  function fmtWhen(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    let diff = (date.getTime() - Date.now()) / 1000;
    for (const [unit, size] of UNITS) {
      if (Math.abs(diff) < size) return RELATIVE.format(Math.round(diff), unit);
      diff /= size;
    }
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  }

  function fmtDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(LOCALE, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  window.I18N = { t, apply, fmtMoney, fmtWhen, fmtDateTime, locale: () => LOCALE, get lang() { return LANG; } };
})();

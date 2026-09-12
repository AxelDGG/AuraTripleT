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

    // Sugerencias de visualización (fila superior del espacio de trabajo)
    'suggest.title': 'VISUALIZACIONES SUGERIDAS',
    'suggest.prev': 'Ver anteriores',
    'suggest.next': 'Ver siguientes',

    'suggest.gastos.title': 'Gráfica de gastos',
    'suggest.gastos.hint': 'Por categoría, este mes',
    'suggest.gastos.prompt': 'Hazme una gráfica de mis gastos por categoría de este mes, con las categorías principales y cuánto subió o bajó cada una.',

    'suggest.ganancias.title': 'Gráfica de ganancias',
    'suggest.ganancias.hint': 'Ingresos contra egresos',
    'suggest.ganancias.prompt': 'Muéstrame una gráfica de mis ingresos contra mis egresos de los últimos meses y cuánto me quedó de ganancia neta en cada uno.',

    'suggest.flujo.title': 'Flujo de efectivo',
    'suggest.flujo.hint': 'Últimos 6 meses',
    'suggest.flujo.prompt': 'Grafica mi flujo de efectivo de los últimos 6 meses: entradas, salidas y saldo al cierre de cada mes.',

    'suggest.reparto.title': 'Reparto de mi dinero',
    'suggest.reparto.hint': 'Distribución entre cuentas',
    'suggest.reparto.prompt': 'Muéstrame en una gráfica cómo está repartido mi dinero entre todas mis cuentas, con el porcentaje de cada una.',

    'suggest.comparativo.title': 'Comparativo mensual',
    'suggest.comparativo.hint': 'Este mes contra el anterior',
    'suggest.comparativo.prompt': 'Compara mi gasto de este mes contra el mes pasado por categoría y señala dónde está la mayor diferencia.',

    'suggest.saldos.title': 'Saldo de mis cuentas',
    'suggest.saldos.hint': 'Todas mis cuentas de un vistazo',
    'suggest.saldos.prompt': 'Muéstrame el saldo de todas mis cuentas con sus detalles.',

    'suggest.tarjeta.title': 'Estado de mi tarjeta',
    'suggest.tarjeta.hint': 'Saldo, límite y fecha de pago',
    'suggest.tarjeta.prompt': '¿Cuánto debo de mi tarjeta de crédito, cuánto me queda de límite y cuándo tengo que pagar?',

    'suggest.credito.title': 'Simular un crédito',
    'suggest.credito.hint': 'Mensualidad y tasa',
    'suggest.credito.prompt': 'Simula un crédito automotriz de 350000 pesos a 48 meses y muéstrame la mensualidad y el total a pagar.',

    'suggest.fx.title': 'Tipo de cambio',
    'suggest.fx.hint': 'Dólar de hoy',
    'suggest.fx.prompt': 'Muéstrame el tipo de cambio de hoy',

    // Riel derecho
    'rail.tab.history': 'HISTORIAL',
    'rail.tab.collection': 'COLECCIÓN',
    'timeline.today': 'Hoy',
    'timeline.yesterday': 'Ayer',
    'timeline.empty': 'Todavía no hay visualizaciones. Pídele algo al agente y aparecerán aquí.',

    'folder.transacciones': 'Transacciones',
    'folder.promociones': 'Promociones',
    'folder.movimientos': 'Movimientos',
    'folder.gastos': 'Gastos',
    'folder.otros': 'Otros',

    'composer.placeholder': 'Escribe o habla con el agente Banorte…',
    'composer.send': 'Enviar',
    'composer.mic': 'Dictar por voz',

    'rail.search': 'BUSCAR…',
    'rail.clear': 'Limpiar búsqueda',
    'rail.noResults': 'Sin resultados para "{q}"',
    'folder.empty': 'Esta carpeta todavía está vacía',
    'folder.ofTotal': 'Coincidencias · {total} en total',

    'canvas.title': '¿Qué quieres ver hoy?',
    'canvas.text': 'El agente consulta tus datos bancarios con herramientas MCP, construye la interfaz al instante y la archiva en la carpeta que mejor le corresponde.',
    'canvas.hint': 'Empieza con una visualización sugerida de arriba, o escribe tu pregunta abajo.',
    'canvas.expand': 'Ver en grande',

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

  function fmtTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function fmtDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(LOCALE, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  window.I18N = { t, apply, fmtMoney, fmtWhen, fmtTime, fmtDateTime, locale: () => LOCALE, get lang() { return LANG; } };
})();

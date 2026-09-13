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

    'suggest.reestructura.title': 'Pagar menos intereses',
    'suggest.reestructura.hint': 'Reestructura tu tarjeta a meses fijos',
    'suggest.reestructura.prompt': 'Quiero pagar menos intereses de mi tarjeta: muéstrame cómo quedaría mi saldo a meses fijos y déjame elegir el plazo.',

    'suggest.gastos.title': 'Gráfica de gastos',
    'suggest.gastos.hint': 'Por categoría, este mes',
    'suggest.gastos.prompt': 'Hazme una gráfica de mis gastos por categoría de este mes, con las categorías principales y cuánto subió o bajó cada una.',

    'suggest.agenda.title': 'Agenda de pagos',
    'suggest.agenda.hint': 'Fechas límite de tus tarjetas',
    'suggest.agenda.prompt': 'Muéstrame en un calendario las fechas límite de pago de mis tarjetas, con el pago mínimo de cada una, y déjame agendar los recordatorios.',

    'suggest.tendencia.title': '¿Gasto más que antes?',
    'suggest.tendencia.hint': 'Tendencia de 6 meses',
    'suggest.tendencia.prompt': 'Compara mi gasto actual contra mi promedio de los últimos 6 meses: muéstrame la tendencia mes a mes y en qué categorías subí más.',

    'suggest.ganancias.title': 'Gráfica de ganancias',
    'suggest.ganancias.hint': 'Ingresos contra egresos',
    'suggest.ganancias.prompt': 'Muéstrame una gráfica de mis ingresos contra mis egresos de los últimos meses y cuánto me quedó de ganancia neta en cada uno.',

    'suggest.movimientos.title': 'Últimos movimientos',
    'suggest.movimientos.hint': 'Tabla que puedo ordenar',
    'suggest.movimientos.prompt': 'Arma una tabla con mis últimos movimientos —fecha, descripción, categoría y monto— que pueda ordenar por monto.',

    'suggest.flujo.title': 'Flujo de efectivo',
    'suggest.flujo.hint': 'Últimos 6 meses',
    'suggest.flujo.prompt': 'Grafica mi flujo de efectivo de los últimos 6 meses: entradas, salidas y saldo al cierre de cada mes.',

    'suggest.transferir.title': 'Transferir dinero',
    'suggest.transferir.hint': 'Formulario listo para enviar',
    'suggest.transferir.prompt': 'Quiero hacer una transferencia: arma el formulario con mis cuentas y mis beneficiarios ya cargados.',

    'suggest.reparto.title': 'Reparto de mi dinero',
    'suggest.reparto.hint': 'Distribución entre cuentas',
    'suggest.reparto.prompt': 'Muéstrame en una gráfica cómo está repartido mi dinero entre todas mis cuentas, con el porcentaje de cada una.',

    'suggest.suscripciones.title': 'Cargos que se repiten',
    'suggest.suscripciones.hint': 'Suscripciones del mes',
    'suggest.suscripciones.prompt': 'Revisa mis movimientos y dime qué cargos se repiten cada mes (suscripciones y domiciliaciones), cuánto suman y qué día me los cobran.',

    'suggest.comparativo.title': 'Comparativo mensual',
    'suggest.comparativo.hint': 'Este mes contra el anterior',
    'suggest.comparativo.prompt': 'Compara mi gasto de este mes contra el mes pasado por categoría y señala dónde está la mayor diferencia.',

    'suggest.semana.title': 'Mi semana',
    'suggest.semana.hint': 'Agenda y pagos juntos',
    'suggest.semana.prompt': 'Muéstrame mi calendario de esta semana junto con los pagos que me tocan, para ver si me alcanza antes de mi próximo pago.',

    'suggest.saldos.title': 'Saldo de mis cuentas',
    'suggest.saldos.hint': 'Todas mis cuentas de un vistazo',
    'suggest.saldos.prompt': 'Muéstrame el saldo de todas mis cuentas con sus detalles.',

    'suggest.inversiones.title': 'Mis inversiones',
    'suggest.inversiones.hint': 'Pagarés y fondos',
    'suggest.inversiones.prompt': 'Muéstrame cómo están repartidas mis inversiones entre pagarés y fondos, cuánto llevo ganado en cada una y qué rendimiento dan.',

    'suggest.tarjeta.title': 'Estado de mi tarjeta',
    'suggest.tarjeta.hint': 'Saldo, límite y fecha de pago',
    'suggest.tarjeta.prompt': '¿Cuánto debo de mi tarjeta de crédito, cuánto me queda de límite y cuándo tengo que pagar?',

    'suggest.recordatorio.title': 'Agendar un pago',
    'suggest.recordatorio.hint': 'Escoge fecha y concepto',
    'suggest.recordatorio.prompt': 'Quiero agendar un pago en mi calendario: déjame elegir la fecha, el concepto y el monto.',

    'suggest.credito.title': 'Simular un crédito',
    'suggest.credito.hint': 'Mensualidad y tasa',
    'suggest.credito.prompt': 'Simula un crédito automotriz de 350000 pesos a 48 meses y muéstrame la mensualidad y el total a pagar.',

    'suggest.mercado.title': 'Mi portafolio',
    'suggest.mercado.hint': 'Rendimiento y seguimiento',
    'suggest.mercado.prompt': 'Muéstrame el rendimiento de mi portafolio en el último año y las acciones que sigo, con su variación del día.',

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
    'canvas.text': 'Habla con el agente y él construirá la pantalla perfecta para lo que necesitas ver.',
    'canvas.hint': 'Elige una sugerencia de arriba o escribe tu pregunta',
    'canvas.expand': 'Ver en grande',

    'agent.thinking': 'Pensando…',
    'agent.tool': 'Consultando {tool}…',
    'agent.timeout': 'La solicitud tardó demasiado. Intenta de nuevo.',
    'agent.error': 'Error de conexión: {msg}',
    'agent.noResponse': 'El agente no devolvió una respuesta.',
    'agent.saved': 'Guardado en {folder}',
    'agent.formSent': 'Formulario enviado: {payload}',
    'agent.action': 'Acción: {name}',
    'agent.building': 'Construyendo tu pantalla…',
    'agent.recalling': 'Recordando lo que sé de ti ({n})…',
    'agent.remembered': 'Norte recordará: {fact}',

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

    // ===== Acceso =====
    'auth.pitch.title': 'Tu banco,\nsiempre contigo',
    'auth.pitch.copy': 'Accede de forma segura a tus cuentas, realiza tus operaciones y mantén el control de tus finanzas.',
    'auth.title': 'Inicia sesión',
    'auth.subtitle': 'Ingresa tus datos para continuar',
    'auth.user': 'Usuario',
    'auth.user.placeholder': 'Ingresa tu usuario',
    'auth.password': 'Contraseña',
    'auth.password.placeholder': 'Ingresa tu contraseña',
    'auth.reveal': 'Mostrar u ocultar la contraseña',
    'auth.submit': 'Iniciar sesión',
    'auth.forgot': '¿Olvidaste tu contraseña?',
    'auth.forgot.toast': 'Recuperación de contraseña: llama al 800 BANORTE o acude a tu sucursal.',
    'auth.register': 'Regístrate',
    'auth.register.toast': 'El alta de nuevos clientes se hace en sucursal o en la app Banorte.',
    'auth.demo': 'Demo · regina · carlos · maria — contraseña Banorte2026',
    'auth.error.empty': 'Escribe tu usuario y tu contraseña.',
    'auth.error.network': 'No pudimos conectar con Banorte. Revisa tu conexión.',

    // ===== Portada de banca en línea =====
    'portal.greet.hello': '¡Hola, {name}!',
    'portal.greet.plain': '¡Hola!',
    'portal.greet.sub': 'Aquí tienes un resumen de tu cuenta y tus movimientos recientes.',
    'portal.balance.caption': 'Saldo disponible',
    'portal.balance.cta': 'Ver movimientos',
    'portal.promo.title': 'Tu dinero, siempre contigo',
    'portal.promo.copy': 'Descarga la app Banorte y ten el control de tus finanzas desde donde estés.',
    'portal.promo.cta': 'Conoce más',
    'portal.promo.toast': 'La app Banorte está en App Store y Google Play con tu misma cuenta.',

    'portal.quick.assistant': 'Asistente IA',
    'portal.quick.assistant.tag': 'NUEVO',
    'portal.quick.transfer': 'Transferir',
    'portal.quick.services': 'Pagar servicios',
    'portal.quick.card': 'Pagar tarjeta',
    'portal.quick.topup': 'Recargar celular',
    'portal.quick.withdraw': 'Retirar sin tarjeta',
    'portal.quick.more': 'Más',

    'portal.movements.title': 'Movimientos recientes',
    'portal.movements.all': 'Ver todos',
    'portal.movements.date': 'Fecha',
    'portal.movements.description': 'Descripción',
    'portal.movements.reference': 'Referencia',
    'portal.movements.amount': 'Movimiento',
    'portal.movements.balance': 'Saldo',

    'portal.alerts.title': 'Alertas',
    'portal.alerts.all': 'Ver todas',
    'portal.alerts.empty': 'No tienes alertas por ahora.',
    'portal.security.title': 'Tu seguridad es primero',
    'portal.security.copy': 'Activa la autenticación en dos pasos y mantén tu cuenta más protegida.',
    'portal.security.cta': 'Configurar ahora',
    'portal.security.toast': 'En la app Banorte puedes activar el acceso con huella o Face ID.',
    'portal.favorites.title': 'Tus favoritos',
    'portal.favorites.all': 'Ver todos',
    'portal.favorites.add': 'Agregar',
    'portal.favorites.toast': 'Transferencia a {name}: pídesela al asistente y la prepara por ti.',

    'portal.all': 'Ese detalle',
    'portal.soon': '{action} llega en la siguiente entrega. Por ahora, pídeselo al asistente.',
    'portal.error': 'No se pudo cargar tu portada.',
    'portal.assistant.back': 'BANCA EN LÍNEA',
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

  // Fecha larga de la portada: "Jueves, 24 de abril de 2026".
  function fmtLongDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const text = date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Fecha de un renglón de movimientos: "24 abr 2026". Las fechas del banco
  // vienen como 'YYYY-MM-DD' y se leen a mediodía UTC para que la zona horaria
  // no las corra un día hacia atrás.
  function fmtShortDate(value) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  window.I18N = { t, apply, fmtMoney, fmtWhen, fmtTime, fmtDateTime, fmtLongDate, fmtShortDate, locale: () => LOCALE, get lang() { return LANG; } };
})();

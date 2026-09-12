// Internacionalización (ES por defecto, EN disponible) y utilidades de formato.
(function () {
  const DICT = {
    es: {
      brand: 'Banorte Investments',
      'nav.dashboard': 'Panel', 'nav.portfolio': 'Portafolio', 'nav.analysis': 'Análisis', 'nav.market': 'Mercado',
      'nav.community': 'Comunidad', 'nav.settings': 'Ajustes', 'nav.support': 'Soporte',
      'welcome': 'Bienvenida,', 'welcome.sub': 'Este es el resumen de tu portafolio de inversión',
      'tabs.market': 'Mercado', 'tabs.wallet': 'Cartera', 'tabs.tools': 'Herramientas',
      'ask.placeholder': 'Pregúntale a Norte AI', 'ask.listening': 'Escuchando… habla ahora', 'ask.mic': 'Dictar por voz',
      'voice.denied': 'Permite el acceso al micrófono en tu navegador para dictar.', 'voice.noSpeech': 'No se detectó voz. Intenta de nuevo.',
      'voice.noMic': 'No se encontró un micrófono.', 'voice.unsupported': 'Tu navegador no soporta dictado por voz (usa Chrome o Edge).',
      'voice.network': 'El reconocimiento de voz necesita conexión a internet.', 'voice.error': 'No se pudo usar el micrófono.',
      'settings.voice': 'Respuestas por voz', 'settings.voice.d': 'Norte AI lee su respuesta cuando preguntas con el micrófono',
      'holding.title': 'Valor total', 'holding.delta': 'en {range}',
      'watchlist.title': 'Lista de seguimiento', 'watchlist.mostViewed': 'Más vistas', 'watchlist.gain': 'Ganan', 'watchlist.lose': 'Pierden',
      'watchlist.empty': 'Nada que mostrar con este filtro',
      'portfolio.title': 'Mi portafolio', 'portfolio.seeAll': 'Ver todo', 'portfolio.units': 'Títulos',
      'promo.title': 'Decisiones basadas en datos',
      'promo.text': 'Ve más allá de la intuición con insights de inversión impulsados por IA y hechos a tu medida.',
      'promo.cta': 'Explorar insights de IA',
      'perf.title': 'Rendimiento del portafolio', 'perf.vsStart': 'vs inicio del periodo',
      'range.1D': '1D', 'range.1W': '1S', 'range.1M': '1M', 'range.6M': '6M', 'range.1Y': '1A',
      'view.portfolio': 'Portafolio', 'view.portfolio.sub': 'Posiciones, distribución e inversiones bancarias',
      'view.analysis': 'Análisis', 'view.analysis.sub': 'Gastos, flujo de efectivo y movimientos de tus cuentas Banorte',
      'view.market': 'Mercado', 'view.market.sub': 'Acciones en seguimiento y tipos de cambio del día',
      'view.community': 'Comunidad', 'view.community.sub': 'Ideas y análisis compartidos por otros inversionistas',
      'stat.total': 'Valor del portafolio', 'stat.day': 'Variación del día', 'stat.positions': 'Posiciones', 'stat.best': 'Mejor del día',
      'stat.invested': 'Inversión bancaria', 'stat.gain': 'Rendimiento acumulado',
      'tbl.symbol': 'Símbolo', 'tbl.units': 'Títulos', 'tbl.price': 'Precio', 'tbl.value': 'Valor', 'tbl.change': 'Cambio', 'tbl.weight': 'Peso',
      'tbl.instrument': 'Instrumento', 'tbl.type': 'Tipo', 'tbl.amount': 'Monto', 'tbl.rate': 'Tasa', 'tbl.maturity': 'Vence', 'tbl.gainCol': 'Ganancia',
      'alloc.title': 'Distribución', 'alloc.center': 'Total',
      'holdings.title': 'Posiciones', 'bankinv.title': 'Inversiones Banorte', 'open': 'Abierto',
      'analysis.spending': 'Gastos por categoría', 'analysis.cashflow': 'Flujo de efectivo mensual', 'analysis.income': 'Ingresos', 'analysis.expenses': 'Gastos',
      'analysis.top': 'Principales categorías', 'analysis.recent': 'Movimientos recientes', 'analysis.accounts': 'Cuentas',
      'analysis.spent': 'Gastado', 'analysis.net': 'Neto', 'analysis.available': 'Crédito disponible',
      'market.rates': 'Tipos de cambio', 'market.buy': 'Compra', 'market.sell': 'Venta', 'market.updated': 'Actualizado', 'market.watching': 'Acciones en seguimiento',
      'tools.credit': 'Simulador de crédito', 'tools.credit.sub': 'Cálculo en vivo vía la herramienta MCP simulate_credit',
      'tools.product': 'Producto', 'tools.amount': 'Monto', 'tools.months': 'Plazo', 'tools.months.unit': 'meses',
      'tools.monthly': 'Pago mensual', 'tools.rate': 'Tasa anual', 'tools.totalPay': 'Total a pagar', 'tools.interest': 'Intereses',
      'tools.fx': 'Convertidor de divisas', 'tools.fx.sub': 'Con el tipo de cambio Banorte del día', 'tools.from': 'De', 'tools.to': 'A',
      'tools.transfer': 'Transferencia SPEI', 'tools.transfer.sub': 'Norte AI genera el formulario con tus cuentas y beneficiarios reales.', 'tools.transfer.cta': 'Iniciar con Norte AI',
      'tools.result.hint': 'Ajusta monto y plazo para ver el cálculo.',
      'community.like': 'Me gusta', 'community.follow': 'Seguir',
      'ai.title': 'Norte AI', 'ai.sub': 'Interfaces generadas en tiempo real vía MCP', 'ai.ready': 'MCP conectado', 'ai.busy': 'trabajando…',
      'ai.empty.title': '¿Qué quieres ver hoy?', 'ai.empty.text': 'Norte consulta tus datos bancarios y bursátiles con herramientas MCP y construye la interfaz al instante.',
      'ai.placeholder': 'Escribe una solicitud…', 'ai.hint': 'Enter para enviar · Esc para cerrar', 'ai.thinking': 'Pensando…', 'ai.tool': 'Consultando {tool}…',
      'ai.timeout': 'La solicitud tardó demasiado. Intenta de nuevo.', 'ai.error': 'Error de conexión: {msg}', 'ai.noResponse': 'Sin respuesta del agente.',
      'ai.formSent': 'Formulario enviado: {payload}', 'ai.done': 'Listo, aquí tienes tu interfaz.',
      'ai.chip.insights': '✨ Insights de mi portafolio', 'ai.chip.spending': '📊 Gastos por categoría', 'ai.chip.transfer': '💸 Hacer una transferencia',
      'ai.chip.credit': '🚗 Simular crédito automotriz', 'ai.chip.fx': '💱 Tipo de cambio', 'ai.chip.card': '🧾 Estado de mi tarjeta',
      'prompt.insights': 'Dame insights accionables de mi portafolio bursátil y mis inversiones: rendimiento, concentración por posición y riesgos. Usa KPIs, una gráfica y una lista de recomendaciones.',
      'prompt.transfer': 'Quiero hacer una transferencia', 'prompt.spending': '¿En qué estoy gastando más? Muéstrame una gráfica de gastos por categoría',
      'prompt.credit': 'Simula un crédito automotriz de 350000 pesos a 48 meses', 'prompt.fx': 'Muéstrame el tipo de cambio de hoy',
      'prompt.card': '¿Cuánto debo de mi tarjeta de crédito y cuándo tengo que pagar?', 'prompt.support': 'Necesito ayuda con mi cuenta. ¿Qué opciones de soporte tengo y cuál es el estado de mis productos?',
      'prompt.holding': 'Analiza mi posición en {symbol}: valor, peso en el portafolio y cómo se ha comportado.',
      'settings.title': 'Ajustes', 'settings.lead': 'Personaliza tu experiencia. Los cambios se guardan en este dispositivo.',
      'settings.lang': 'Idioma', 'settings.lang.d': 'Interfaz en español o inglés', 'settings.motion': 'Reducir animaciones', 'settings.motion.d': 'Desactiva transiciones y efectos',
      'settings.notif': 'Alertas de precio', 'settings.notif.d': 'Avisos cuando una acción en seguimiento se mueve ±2%', 'settings.email': 'Resumen semanal por correo', 'settings.email.d': 'Cada lunes a las 8:00',
      'settings.saved': 'Ajustes guardados',
      'support.title': 'Soporte', 'support.lead': 'Estamos para ayudarte 24/7. Consulta las preguntas frecuentes o habla con Norte AI.',
      'support.chat': 'Hablar con Norte AI', 'support.call': 'Llamar 800 226 6783',
      'support.q1': '¿Cómo hago una transferencia?', 'support.a1': 'Pídeselo a Norte AI o usa la pestaña Herramientas. Toda transferencia requiere que confirmes el formulario; nunca se ejecuta desde texto libre.',
      'support.q2': '¿Los datos del portafolio son en tiempo real?', 'support.a2': 'Los precios se obtienen vía herramientas MCP del servidor banorte-banking. En esta demo son datos simulados y deterministas.',
      'support.q3': '¿Cómo cambio el idioma?', 'support.a3': 'En Ajustes puedes alternar entre español e inglés; el cambio aplica al instante.',
      'notif.title': 'Notificaciones', 'notif.markRead': 'Marcar leídas',
      'notif.1.t': 'NVDA subió 2.12%', 'notif.1.d': 'Tu posición ganó $43.28 hoy.', 'notif.2.t': 'Pagaré vence el 20 sep', 'notif.2.d': 'Pagaré Banorte 28 días por $50,000 MXN.',
      'notif.3.t': 'Pago de tarjeta próximo', 'notif.3.d': 'Tarjeta Banorte Oro: vence el 15 sep.', 'notif.now': 'ahora', 'notif.h': 'hace {n} h', 'notif.d': 'hace {n} d',
      'toast.langChanged': 'Idioma actualizado', 'toast.readAll': 'Notificaciones marcadas como leídas', 'toast.loadError': 'No se pudo cargar el dashboard',
      'toast.retry': 'Reintentar', 'toast.holding': 'Abriendo {symbol} en tu portafolio', 'toast.copied': 'Copiado al portapapeles',
      'error.dashboard': 'No pudimos cargar tus datos. Revisa que el servidor esté activo.',
      'profile.segment': 'Cliente {segment}',
      'kbd.focus': 'Presiona / para preguntar',
    },
    en: {
      brand: 'Banorte Investments',
      'nav.dashboard': 'Dashboard', 'nav.portfolio': 'Portfolio', 'nav.analysis': 'Analysis', 'nav.market': 'Market',
      'nav.community': 'Community', 'nav.settings': 'Settings', 'nav.support': 'Support',
      'welcome': 'Welcome,', 'welcome.sub': "Here's your investment portfolio overview",
      'tabs.market': 'Market', 'tabs.wallet': 'Wallet', 'tabs.tools': 'Tools',
      'ask.placeholder': 'Ask Norte AI anything', 'ask.listening': 'Listening… speak now', 'ask.mic': 'Dictate by voice',
      'voice.denied': 'Allow microphone access in your browser to dictate.', 'voice.noSpeech': 'No speech detected. Try again.',
      'voice.noMic': 'No microphone was found.', 'voice.unsupported': 'Your browser does not support voice dictation (use Chrome or Edge).',
      'voice.network': 'Voice recognition needs an internet connection.', 'voice.error': 'Could not use the microphone.',
      'settings.voice': 'Voice replies', 'settings.voice.d': 'Norte AI reads its reply aloud when you ask by voice',
      'holding.title': 'Total Holding', 'holding.delta': 'over {range}',
      'watchlist.title': 'Watchlist', 'watchlist.mostViewed': 'Most Viewed', 'watchlist.gain': 'Gain', 'watchlist.lose': 'Lose',
      'watchlist.empty': 'Nothing to show for this filter',
      'portfolio.title': 'My Portfolio', 'portfolio.seeAll': 'See all', 'portfolio.units': 'Units',
      'promo.title': 'Decisions Powered by Data',
      'promo.text': 'Move beyond guesswork with AI-driven investment insights tailored to your strategy.',
      'promo.cta': 'Explore AI Insights',
      'perf.title': 'Portfolio Performance', 'perf.vsStart': 'vs period start',
      'range.1D': '1D', 'range.1W': '1W', 'range.1M': '1M', 'range.6M': '6M', 'range.1Y': '1Y',
      'view.portfolio': 'Portfolio', 'view.portfolio.sub': 'Positions, allocation and bank investments',
      'view.analysis': 'Analysis', 'view.analysis.sub': 'Spending, cash flow and activity across your Banorte accounts',
      'view.market': 'Market', 'view.market.sub': "Stocks you follow and today's exchange rates",
      'view.community': 'Community', 'view.community.sub': 'Ideas and analysis shared by fellow investors',
      'stat.total': 'Portfolio value', 'stat.day': "Today's change", 'stat.positions': 'Positions', 'stat.best': 'Best today',
      'stat.invested': 'Bank investments', 'stat.gain': 'Accumulated return',
      'tbl.symbol': 'Symbol', 'tbl.units': 'Units', 'tbl.price': 'Price', 'tbl.value': 'Value', 'tbl.change': 'Change', 'tbl.weight': 'Weight',
      'tbl.instrument': 'Instrument', 'tbl.type': 'Type', 'tbl.amount': 'Amount', 'tbl.rate': 'Rate', 'tbl.maturity': 'Maturity', 'tbl.gainCol': 'Gain',
      'alloc.title': 'Allocation', 'alloc.center': 'Total',
      'holdings.title': 'Holdings', 'bankinv.title': 'Banorte investments', 'open': 'Open-ended',
      'analysis.spending': 'Spending by category', 'analysis.cashflow': 'Monthly cash flow', 'analysis.income': 'Income', 'analysis.expenses': 'Expenses',
      'analysis.top': 'Top categories', 'analysis.recent': 'Recent activity', 'analysis.accounts': 'Accounts',
      'analysis.spent': 'Spent', 'analysis.net': 'Net', 'analysis.available': 'Available credit',
      'market.rates': 'Exchange rates', 'market.buy': 'Buy', 'market.sell': 'Sell', 'market.updated': 'Updated', 'market.watching': 'Stocks you follow',
      'tools.credit': 'Credit simulator', 'tools.credit.sub': 'Live calculation through the simulate_credit MCP tool',
      'tools.product': 'Product', 'tools.amount': 'Amount', 'tools.months': 'Term', 'tools.months.unit': 'months',
      'tools.monthly': 'Monthly payment', 'tools.rate': 'Annual rate', 'tools.totalPay': 'Total payment', 'tools.interest': 'Interest',
      'tools.fx': 'Currency converter', 'tools.fx.sub': "Using today's Banorte exchange rate", 'tools.from': 'From', 'tools.to': 'To',
      'tools.transfer': 'SPEI transfer', 'tools.transfer.sub': 'Norte AI builds the form with your real accounts and payees.', 'tools.transfer.cta': 'Start with Norte AI',
      'tools.result.hint': 'Adjust amount and term to see the calculation.',
      'community.like': 'Like', 'community.follow': 'Follow',
      'ai.title': 'Norte AI', 'ai.sub': 'Interfaces generated in real time via MCP', 'ai.ready': 'MCP connected', 'ai.busy': 'working…',
      'ai.empty.title': 'What would you like to see?', 'ai.empty.text': 'Norte queries your banking and market data through MCP tools and builds the interface on the fly.',
      'ai.placeholder': 'Type a request…', 'ai.hint': 'Enter to send · Esc to close', 'ai.thinking': 'Thinking…', 'ai.tool': 'Calling {tool}…',
      'ai.timeout': 'The request took too long. Please try again.', 'ai.error': 'Connection error: {msg}', 'ai.noResponse': 'No response from the agent.',
      'ai.formSent': 'Form submitted: {payload}', 'ai.done': 'Done, here is your interface.',
      'ai.chip.insights': '✨ Portfolio insights', 'ai.chip.spending': '📊 Spending by category', 'ai.chip.transfer': '💸 Make a transfer',
      'ai.chip.credit': '🚗 Simulate a car loan', 'ai.chip.fx': '💱 Exchange rates', 'ai.chip.card': '🧾 Credit card status',
      'prompt.insights': 'Give me actionable insights on my stock portfolio and investments: performance, concentration per position and risks. Use KPIs, a chart and a list of recommendations. Answer in English.',
      'prompt.transfer': 'I want to make a transfer. Answer in English.', 'prompt.spending': 'What am I spending the most on? Show me a chart of spending by category. Answer in English.',
      'prompt.credit': 'Simulate a car loan of 350000 pesos over 48 months. Answer in English.', 'prompt.fx': "Show me today's exchange rates. Answer in English.",
      'prompt.card': 'How much do I owe on my credit card and when is it due? Answer in English.', 'prompt.support': 'I need help with my account. What support options do I have and what is the status of my products? Answer in English.',
      'prompt.holding': 'Analyze my {symbol} position: value, portfolio weight and how it has performed. Answer in English.',
      'settings.title': 'Settings', 'settings.lead': 'Personalize your experience. Changes are saved on this device.',
      'settings.lang': 'Language', 'settings.lang.d': 'Interface in Spanish or English', 'settings.motion': 'Reduce motion', 'settings.motion.d': 'Turns off transitions and effects',
      'settings.notif': 'Price alerts', 'settings.notif.d': 'Notify when a watched stock moves ±2%', 'settings.email': 'Weekly email digest', 'settings.email.d': 'Every Monday at 8:00',
      'settings.saved': 'Settings saved',
      'support.title': 'Support', 'support.lead': "We're here 24/7. Browse the FAQ or talk to Norte AI.",
      'support.chat': 'Talk to Norte AI', 'support.call': 'Call 800 226 6783',
      'support.q1': 'How do I make a transfer?', 'support.a1': 'Ask Norte AI or use the Tools tab. Every transfer requires you to confirm the form; it never executes from free text.',
      'support.q2': 'Is portfolio data real time?', 'support.a2': 'Prices come through MCP tools from the banorte-banking server. In this demo the data is simulated and deterministic.',
      'support.q3': 'How do I change the language?', 'support.a3': 'In Settings you can switch between Spanish and English; it applies instantly.',
      'notif.title': 'Notifications', 'notif.markRead': 'Mark all read',
      'notif.1.t': 'NVDA up 2.12%', 'notif.1.d': 'Your position gained $43.28 today.', 'notif.2.t': 'Note matures Sep 20', 'notif.2.d': 'Banorte 28-day note for $50,000 MXN.',
      'notif.3.t': 'Card payment coming up', 'notif.3.d': 'Banorte Oro card: due Sep 15.', 'notif.now': 'now', 'notif.h': '{n}h ago', 'notif.d': '{n}d ago',
      'toast.langChanged': 'Language updated', 'toast.readAll': 'Notifications marked as read', 'toast.loadError': 'Could not load the dashboard',
      'toast.retry': 'Retry', 'toast.holding': 'Opening {symbol} in your portfolio', 'toast.copied': 'Copied to clipboard',
      'error.dashboard': "We couldn't load your data. Make sure the server is running.",
      'profile.segment': '{segment} client',
      'kbd.focus': 'Press / to ask',
    },
  };

  const LOCALES = { es: 'es-MX', en: 'en-US' };
  const state = { lang: safeGet('lang') || 'es' };
  if (!DICT[state.lang]) state.lang = 'es';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function t(key, vars) {
    const raw = DICT[state.lang][key] ?? DICT.es[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
    document.documentElement.lang = state.lang;
  }

  function setLang(lang) {
    if (!DICT[lang]) return;
    state.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* almacenamiento no disponible */ }
    apply();
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  const locale = () => LOCALES[state.lang];

  function fmtNumber(n, decimals = 2) {
    return Number(n).toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  // "$ 45,710.50" como la referencia; se agrega el código cuando la moneda no es USD.
  function fmtMoney(n, currency = 'USD', decimals = 2) {
    const sign = n < 0 ? '-' : '';
    return `${sign}$ ${fmtNumber(Math.abs(n), decimals)}${currency === 'USD' ? '' : ` ${currency}`}`;
  }
  function fmtSigned(n, currency = 'USD', decimals = 2) {
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return `${sign}$${fmtNumber(Math.abs(n), decimals)}${currency === 'USD' ? '' : ` ${currency}`}`;
  }
  function fmtPct(n, decimals = 2, withSign = true) {
    const sign = withSign && n > 0 ? '+' : '';
    return `${sign}${fmtNumber(n, decimals)}%`;
  }
  function fmtCompact(n) {
    const abs = Math.abs(n);
    if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
    if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
    return String(Math.round(n));
  }
  function ordinal(day) {
    if (state.lang !== 'en') return String(day);
    const s = ['th', 'st', 'nd', 'rd'];
    const v = day % 100;
    return `${day}${s[(v - 20) % 10] || s[v] || s[0]}`;
  }
  function fmtDate(iso, style = 'long') {
    const d = new Date(iso);
    const loc = locale();
    if (style === 'time') return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (style === 'monthShort') return d.toLocaleDateString(loc, { month: 'short' }).replace('.', '');
    if (style === 'weekday') return d.toLocaleDateString(loc, { weekday: 'short' }).replace('.', '');
    if (style === 'dayMonth') return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }).replace('.', '');
    if (style === 'longTime') return `${fmtDate(iso, 'long')} · ${fmtDate(iso, 'time')}`;
    const month = d.toLocaleDateString(loc, { month: 'short' }).replace('.', '');
    return state.lang === 'en'
      ? `${ordinal(d.getDate())} ${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`
      : `${d.getDate()} ${month} ${d.getFullYear()}`;
  }

  window.I18N = { t, apply, setLang, get lang() { return state.lang; }, locale, fmtNumber, fmtMoney, fmtSigned, fmtPct, fmtCompact, fmtDate };
})();

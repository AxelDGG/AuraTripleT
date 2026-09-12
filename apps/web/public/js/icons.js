// Iconografía inline (SVG monocromo) de interfaz. Los activos de marca
// (logotipo, telefono, avatar) son PNG oficiales y viven en public/img/.
// El trazo y el relleno los define el CSS de cada contexto; aquí solo va la
// geometría sobre un lienzo de 24x24.
(function () {
  const S = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    location: S('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
    logout: S('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9"/>'),
    search: S('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 4.6 4.6"/>'),
    mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    send: S('<path d="M3 11.5 21 3l-8.5 18-2.3-7.2L3 11.5Z"/>'),
    close: S('<path d="M18 6 6 18M6 6l12 12"/>'),
    chevron: S('<path d="m6 9 6 6 6-6"/>'),
    chevronLeft: S('<path d="m14 6-6 6 6 6"/>'),
    chevronRight: S('<path d="m10 6 6 6-6 6"/>'),
    sparkle: S('<path d="M12 3l1.9 5.4L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.6L12 3Z" fill="currentColor" stroke="none"/>'),
    folder: S('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2.5h7.8A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7.5Z"/>'),
    clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>'),

    // Glifos de las sugerencias de visualizacion: cada uno insinua la forma de
    // la grafica que el agente va a construir.
    chartBar: S('<path d="M4 20V10M9.3 20V4M14.7 20v-7M20 20v-11"/>'),
    chartLine: S('<path d="M3.5 16.5 9 10.5l3.6 3.4L20.5 6"/><path d="M15.8 6h4.7v4.6"/>'),
    chartArea: S('<path d="M3.5 15 8.5 9.6l3.8 3.2 4.4-5.4 3.8 3.4"/><path d="M3.5 15v4.5h17V10.8"/>'),
    chartPie: S('<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z"/><path d="M14.6 3.9A8.5 8.5 0 0 1 20.1 9.4"/>'),
    chartStack: S('<path d="M4 20h16"/><rect x="5.5" y="12" width="4" height="5.5" rx="1"/><rect x="14.5" y="7" width="4" height="10.5" rx="1"/>'),
    wallet: S('<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h10.3A2.5 2.5 0 0 1 19 8v0"/><rect x="3.5" y="8" width="17" height="10.5" rx="2.6"/><circle cx="16.3" cy="13.2" r="1.2"/>'),
    card: S('<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 10h18M6.5 14.6h3.6"/>'),
    exchange: S('<path d="M4 8.5h13.5M14 5l3.5 3.5L14 12"/><path d="M20 15.5H6.5M10 12l-3.5 3.5L10 19"/>'),
    target: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>'),
    layers: S('<path d="m12 3.5 8.2 4.3-8.2 4.3-8.2-4.3L12 3.5Z"/><path d="m3.8 12.2 8.2 4.3 8.2-4.3"/><path d="m3.8 16.4 8.2 4.3 8.2-4.3"/>'),
    history: S('<path d="M3.8 12a8.2 8.2 0 1 0 2.6-6"/><path d="M3.6 3.8v3.4h3.4"/><path d="M12 7.6V12l3 1.8"/>'),
    expand: S('<path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"/>'),
  };

  function icon(name) { return ICONS[name] ?? ''; }

  // Rellena todos los marcadores [data-icon] de un subárbol. El SVG es nuestro,
  // nunca contenido del modelo, así que innerHTML es seguro aquí.
  function fill(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  }

  function el(name) {
    const tpl = document.createElement('template');
    tpl.innerHTML = icon(name).trim();
    return tpl.content.firstElementChild;
  }

  window.ICONS = { icon, fill, el, has: (name) => Boolean(ICONS[name]) };
})();

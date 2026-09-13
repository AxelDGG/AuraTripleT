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

    // Mini-gráficas con relleno: imitan la forma real de cada tipo de visualización.
    chartBar: S('<rect x="2" y="15" width="3.5" height="7.5" rx="0.6" fill="currentColor" opacity="0.35" stroke="none"/><rect x="6.8" y="9" width="3.5" height="13.5" rx="0.6" fill="currentColor" stroke="none"/><rect x="11.6" y="12" width="3.5" height="10.5" rx="0.6" fill="currentColor" opacity="0.7" stroke="none"/><rect x="16.4" y="5.5" width="3.5" height="17" rx="0.6" fill="currentColor" opacity="0.9" stroke="none"/><rect x="19" y="10" width="3.5" height="12.5" rx="0.6" fill="currentColor" opacity="0.55" stroke="none"/>'),
    chartLine: S('<path d="M2 17 6.5 11.5 10.5 14 15.5 8 22 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17 6.5 11.5 10.5 14 15.5 8 22 5.5V22.5H2Z" fill="currentColor" opacity="0.18" stroke="none"/><circle cx="6.5" cy="11.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="10.5" cy="14" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8" r="1.3" fill="currentColor" stroke="none"/>'),
    chartArea: S('<path d="M2 16 6.5 11 10.5 13.5 15.5 8 22 9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 16 6.5 11 10.5 13.5 15.5 8 22 9.5V22.5H2Z" fill="currentColor" opacity="0.25" stroke="none"/><path d="M2 20 6.5 16.5 10.5 18 15.5 14 22 15.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/><path d="M2 20 6.5 16.5 10.5 18 15.5 14 22 15.5V22.5H2Z" fill="currentColor" opacity="0.12" stroke="none"/>'),
    chartPie: S('<path d="M12 12 12 3 A9 9 0 0 1 12 21 Z" fill="currentColor" opacity="0.9" stroke="none"/><path d="M12 12 12 21 A9 9 0 0 1 3.44 9.22 Z" fill="currentColor" opacity="0.55" stroke="none"/><path d="M12 12 3.44 9.22 A9 9 0 0 1 12 3 Z" fill="currentColor" opacity="0.3" stroke="none"/><circle cx="12" cy="12" r="3.5" fill="var(--surface,#fff)" stroke="none"/>'),
    chartStack: S('<rect x="2" y="14.5" width="5.5" height="8" rx="0.6" fill="currentColor" opacity="0.9" stroke="none"/><rect x="2" y="9" width="5.5" height="5.5" rx="0.6" fill="currentColor" opacity="0.45" stroke="none"/><rect x="9.3" y="11.5" width="5.5" height="11" rx="0.6" fill="currentColor" opacity="0.9" stroke="none"/><rect x="9.3" y="5.5" width="5.5" height="6" rx="0.6" fill="currentColor" opacity="0.45" stroke="none"/><rect x="16.5" y="13" width="5.5" height="9.5" rx="0.6" fill="currentColor" opacity="0.9" stroke="none"/><rect x="16.5" y="5" width="5.5" height="8" rx="0.6" fill="currentColor" opacity="0.45" stroke="none"/>'),
    wallet: S('<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h10.3A2.5 2.5 0 0 1 19 8v0"/><rect x="3.5" y="8" width="17" height="10.5" rx="2.6"/><circle cx="16.3" cy="13.2" r="1.2"/>'),
    card: S('<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 10h18M6.5 14.6h3.6"/>'),
    exchange: S('<path d="M4 8.5h13.5M14 5l3.5 3.5L14 12"/><path d="M20 15.5H6.5M10 12l-3.5 3.5L10 19"/>'),
    target: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>'),
    // Previews chart para las sugerencias que no son gráficas de serie
    chartKpi: S('<rect x="1" y="2.5" width="10" height="8.5" rx="1.5" fill="currentColor" opacity="0.85" stroke="none"/><rect x="13" y="2.5" width="10" height="8.5" rx="1.5" fill="currentColor" opacity="0.42" stroke="none"/><rect x="1" y="13.5" width="10" height="8.5" rx="1.5" fill="currentColor" opacity="0.32" stroke="none"/><rect x="13" y="13.5" width="10" height="8.5" rx="1.5" fill="currentColor" opacity="0.65" stroke="none"/>'),
    chartProgress: S('<rect x="2" y="4.5" width="20" height="12" rx="2" fill="currentColor" opacity="0.18" stroke="none"/><rect x="2" y="8" width="20" height="4" fill="currentColor" opacity="0.38" stroke="none"/><rect x="4" y="13" width="4.5" height="1.8" rx="0.5" fill="currentColor" opacity="0.5" stroke="none"/><rect x="2" y="19" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.15" stroke="none"/><rect x="2" y="19" width="13.5" height="3" rx="1.5" fill="currentColor" opacity="0.82" stroke="none"/>'),
    chartAmort: S('<rect x="1.5" y="7.5" width="3.5" height="15" rx="0.6" fill="currentColor" stroke="none" opacity="0.9"/><rect x="6" y="9.5" width="3.5" height="13" rx="0.6" fill="currentColor" stroke="none" opacity="0.75"/><rect x="10.5" y="12" width="3.5" height="10.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.62"/><rect x="15" y="15" width="3.5" height="7.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.5"/><rect x="19.5" y="18.5" width="3" height="4" rx="0.6" fill="currentColor" stroke="none" opacity="0.38"/><path d="M3.25 7.5 7.75 9.5 12.25 12 16.75 15 21 18.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="2 1.5" opacity="0.45"/>'),
    chartFx: S('<rect x="2" y="11" width="4.5" height="11.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.9"/><rect x="7.5" y="15" width="4.5" height="7.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.42"/><line x1="13" y1="4" x2="13" y2="22.5" stroke="currentColor" stroke-width="0.75" opacity="0.2"/><rect x="14" y="7.5" width="4.5" height="15" rx="0.6" fill="currentColor" stroke="none" opacity="0.9"/><rect x="19.5" y="12" width="4.5" height="10.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.42"/><path d="M2 7h9M9 5l2.5 2-2.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.55"/><path d="M22 7h-9M15 5l-2.5 2 2.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.55"/>'),
    panelToggle: S('<path d="M15 18l-6-6 6-6"/>'),
    layers: S('<path d="m12 3.5 8.2 4.3-8.2 4.3-8.2-4.3L12 3.5Z"/><path d="m3.8 12.2 8.2 4.3 8.2-4.3"/><path d="m3.8 16.4 8.2 4.3 8.2-4.3"/>'),
    history: S('<path d="M3.8 12a8.2 8.2 0 1 0 2.6-6"/><path d="M3.6 3.8v3.4h3.4"/><path d="M12 7.6V12l3 1.8"/>'),
    expand: S('<path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),

    // Iconos de categoría para la lista de transacciones
    catIncome: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5"/>'),
    catCart: S('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'),
    catFood: S('<path d="M3 2v7c0 2.8 2.2 5 5 5h1v8h2v-8h1a5 5 0 0 0 5-5V2"/><path d="M7 2v5M12 2v5M17 2v5"/>'),
    catPlay: S('<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none"/>'),
    catBolt: S('<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" fill="currentColor" stroke="none" opacity="0.85"/>'),
    catCar: S('<path d="M5 17H3a2 2 0 0 1-2-2v-4l2.5-5.5A2 2 0 0 1 5.4 4h13.2a2 2 0 0 1 1.9 1.5L23 11v4a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M5 11h14"/>'),
    catBag: S('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    catHealth: S('<circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>'),
    catHome: S('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="M9 22V12h6v10"/>'),
    catBuilding: S('<path d="M3 21h18"/><rect x="4" y="3" width="7" height="18"/><rect x="15" y="9" width="6" height="12"/><path d="M7 7h1M7 11h1M7 15h1M19 13h1M19 17h1"/>'),
    catSavings: S('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M9.5 16.5c.8.8 1.8 1.2 3 1.2a4 4 0 0 0 0-8"/>'),
    catTransfer: S('<path d="M4 9h13M14 5l3.5 3.5L14 12"/><path d="M20 15H7M10 12l-3.5 3.5L10 19"/>'),
    catCard: S('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/>'),
    catMoney: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v2.5M12 14.5V17M9.5 9.8A2.5 2.5 0 0 1 12 8.5c1.4 0 2.5.9 2.5 2s-1 1.8-2.5 2-2.5.9-2.5 2 1 2.1 2.5 2.1c1.2 0 2.2-.6 2.6-1.4"/>'),

    // Iconos de alertas
    alertInfo: S('<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'),
    alertSuccess: S('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-5.5"/>'),
    alertWarning: S('<path d="m10.3 3.6-8.3 14A2 2 0 0 0 3.7 20.5h16.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16.5v.5"/>'),
    alertError: S('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>'),

    convAI: S('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z"/>'),
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

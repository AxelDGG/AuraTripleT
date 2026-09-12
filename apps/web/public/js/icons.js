// Iconografía inline (SVG monocromo) para no depender de recursos externos.
// El trazo y el relleno los define el CSS de cada contexto; aquí solo va la
// geometría sobre un lienzo de 24x24.
(function () {
  const S = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    // Marca: tres franjas ascendentes, el gesto del norte en la identidad Banorte.
    brand: S('<path d="M2.5 16.5 8 11l3 3 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 6.2h5.3v5.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 20.8h18.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
    location: S('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
    phone: S('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
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

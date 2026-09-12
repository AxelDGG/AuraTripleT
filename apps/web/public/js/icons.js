// Iconografía inline (SVG monocromo) para no depender de recursos externos.
(function () {
  const S = (inner, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${inner}</svg>`;

  const ICONS = {
    brand: S('<path d="M12 2.5 16.2 12 12 21.5 7.8 12 12 2.5Z" fill="currentColor"/><path d="M12 2.5V21.5" stroke="#0e0c10" stroke-width="1.2"/>'),
    dashboard: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 12 8.2 8.2"/><path d="M12 6v1.5M18 12h-1.5M12 18v-1.5M6 12h1.5"/>'),
    portfolio: S('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12h18"/>'),
    analysis: S('<rect x="3" y="3" width="18" height="18" rx="3.5"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
    market: S('<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 4.5-4.5"/>'),
    community: S('<circle cx="12" cy="6.5" r="2.5"/><circle cx="5.5" cy="17" r="2.5"/><circle cx="18.5" cy="17" r="2.5"/><path d="M12 9v3.5M12 12.5 7.5 15M12 12.5l4.5 2.5"/>'),
    settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M5.3 18.7l2-2M16.7 7.3l2-2"/>'),
    support: S('<rect x="3" y="3" width="18" height="18" rx="4.5"/><text x="12" y="15.3" text-anchor="middle" font-size="8.5" font-weight="700" font-family="Manrope, sans-serif" fill="currentColor" stroke="none">24</text>'),
    bell: S('<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>'),
    mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
    chevron: S('<path d="m6 9 6 6 6-6"/>'),
    arrowUpRight: S('<path d="M7 17 17 7M8.5 7H17v8.5"/>'),
    arrowUp: S('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    arrowDown: S('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    close: S('<path d="M18 6 6 18M6 6l12 12"/>'),
    send: S('<path d="M3 11.5 21 3l-8.5 18-2.3-7.2L3 11.5Z"/>'),
    sparkle: S('<path d="M12 3l1.9 5.4L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.6L12 3Z"/>'),
    check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    copy: S('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    heart: S('<path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8.2a4.3 4.3 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10Z"/>'),
    phone: S('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
    dots: S('<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
    bank: S('<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
    swap: S('<path d="M7 4v13M3.5 13.5 7 17l3.5-3.5M17 20V7M13.5 10.5 17 7l3.5 3.5"/>'),
    logout: S('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9"/>'),
  };

  // Logos de empresas (rellenos, estilizados)
  const LOGOS = {
    AAPL: S('<path fill="currentColor" d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>'),
    AMZN: S('<text x="12" y="14.5" text-anchor="middle" font-size="15" font-weight="800" font-family="Manrope, sans-serif" fill="currentColor">a</text><path d="M5 17.6c4 2.7 10 2.7 14 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 17.6l-1.6-.4M19 17.6l-.3 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    MSFT: S('<rect x="3" y="3" width="8.3" height="8.3" fill="currentColor"/><rect x="12.7" y="3" width="8.3" height="8.3" fill="currentColor"/><rect x="3" y="12.7" width="8.3" height="8.3" fill="currentColor"/><rect x="12.7" y="12.7" width="8.3" height="8.3" fill="currentColor"/>'),
    NVDA: S('<path fill="currentColor" d="M12 5.5C6.8 5.5 2.5 8.4 2.5 12s4.3 6.5 9.5 6.5 9.5-2.9 9.5-6.5-4.3-6.5-9.5-6.5Zm0 10.3a3.8 3.8 0 1 1 0-7.6 3.8 3.8 0 0 1 0 7.6Zm0-5.8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>'),
    SPOT: S('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M6.6 9.4c3.6-1 8.1-.8 11.1 1.1M7.2 12.4c3-.8 6.7-.6 9.4 1M7.8 15.3c2.4-.6 5.2-.5 7.4.8" fill="none" stroke="#111" stroke-width="1.7" stroke-linecap="round"/>'),
    TSLA: S('<path fill="currentColor" d="M12 6.6 4 5v2.6l8 1.6 8-1.6V5l-8 1.6Zm-1.2 3.1v11h2.4v-11h-2.4Z"/>'),
    META: S('<path d="M3.2 15.2c0-4.1 2-8.2 4.6-8.2s4.2 5 4.2 5 1.6-5 4.2-5 4.6 4.1 4.6 8.2c0 2.2-1.3 3.3-2.8 3.3-2.5 0-4-4.2-6-8.3-2 4.1-3.5 8.3-6 8.3-1.5 0-2.8-1.1-2.8-3.3Z" fill="none" stroke="currentColor" stroke-width="1.9"/>'),
    GOOGL: S('<text x="12" y="16.8" text-anchor="middle" font-size="15" font-weight="800" font-family="Manrope, sans-serif" fill="currentColor">G</text>'),
  };

  function icon(name) { return ICONS[name] ?? ''; }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function logo(symbol) {
    return LOGOS[symbol] ?? S(`<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="800" font-family="Manrope, sans-serif" fill="currentColor">${escapeHtml(String(symbol).slice(0, 2))}</text>`);
  }
  function el(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  window.ICONS = { icon, logo, el, has: (name) => Boolean(ICONS[name]) };
})();

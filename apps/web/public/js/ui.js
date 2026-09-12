// Piezas de interfaz compartidas: helpers de DOM, toasts y el overlay que
// muestra una visualización del historial a tamaño completo.
(function () {
  const $ = (id) => document.getElementById(id);
  const TOAST_MS = 3400;

  // Constructor de nodos. Siempre textContent, nunca innerHTML: lo que viene del
  // agente o de la base no se interpreta como HTML en ningún punto.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function toast(message, type = 'info') {
    const root = $('toastRoot');
    const node = el('div', `toast ${type}`);
    node.setAttribute('role', 'status');
    node.append(el('i'), el('span', null, message));
    root.append(node);
    setTimeout(() => {
      node.classList.add('is-leaving');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    }, TOAST_MS);
  }

  function banner(message, onRetry) {
    const node = $('banner');
    node.hidden = false;
    node.replaceChildren(el('span', null, message));
    if (onRetry) {
      const retry = el('button', 'chip', window.I18N.t('error.retry'));
      retry.type = 'button';
      retry.addEventListener('click', () => { hideBanner(); onRetry(); });
      node.append(retry);
    }
  }

  function hideBanner() { $('banner').hidden = true; }

  // ---------- Overlay ----------
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  const overlayState = { open: false, returnFocus: null };

  function trapFocus(e) {
    if (e.key !== 'Tab' || !overlayState.open) return;
    const items = [...$('overlay').querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openOverlay({ title, folderLabel, meta, spec }) {
    const overlay = $('overlay');
    if (!overlayState.open) overlayState.returnFocus = document.activeElement;
    overlayState.open = true;
    overlay.hidden = false;
    overlay.classList.remove('is-closing');
    $('overlayTitle').textContent = title ?? '';
    $('overlayFolder').textContent = folderLabel ?? '';
    $('overlayMeta').textContent = meta ?? '';
    window.renderGeneratedUi($('overlayBody'), spec?.ui ?? []);
    $('overlayClose').focus();
  }

  function closeOverlay() {
    const overlay = $('overlay');
    if (!overlayState.open) return;
    overlayState.open = false;
    overlay.classList.add('is-closing');
    // Se espera a que termine la animación de salida antes de ocultarlo, si no
    // el overlay desaparecería de golpe.
    overlay.addEventListener('animationend', function done() {
      overlay.removeEventListener('animationend', done);
      overlay.hidden = true;
      overlay.classList.remove('is-closing');
      $('overlayBody').replaceChildren();
    }, { once: true });
    overlayState.returnFocus?.focus?.();
  }

  function init() {
    $('overlayClose').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
    $('overlay').addEventListener('keydown', trapFocus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlayState.open) closeOverlay(); });
  }

  window.UI = { init, el, toast, banner, hideBanner, openOverlay, closeOverlay, get overlayOpen() { return overlayState.open; } };
})();

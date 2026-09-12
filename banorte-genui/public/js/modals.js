// Modales (Ajustes, Soporte), notificaciones y toasts.
(function () {
  const $ = (id) => document.getElementById(id);
  const TOAST_MS = 3200;
  const NOTIFS = [
    { id: 1, t: 'notif.1.t', d: 'notif.1.d', when: { key: 'notif.now' } },
    { id: 2, t: 'notif.2.t', d: 'notif.2.d', when: { key: 'notif.h', n: 3 } },
    { id: 3, t: 'notif.3.t', d: 'notif.3.d', when: { key: 'notif.d', n: 1 } },
  ];
  const DEFAULT_SETTINGS = { motion: false, notif: true, email: true, voice: true };
  const state = { read: new Set(), settings: { ...DEFAULT_SETTINGS } };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem('settings') || 'null');
      if (saved && typeof saved === 'object') state.settings = { ...DEFAULT_SETTINGS, ...saved };
      const read = JSON.parse(localStorage.getItem('notifRead') || '[]');
      if (Array.isArray(read)) state.read = new Set(read);
    } catch { /* almacenamiento no disponible: se usan valores por defecto */ }
  }
  function persist() {
    try {
      localStorage.setItem('settings', JSON.stringify(state.settings));
      localStorage.setItem('notifRead', JSON.stringify([...state.read]));
    } catch { /* ignorar */ }
  }
  function applySettings() {
    document.documentElement.dataset.motion = state.settings.motion ? 'reduced' : '';
  }

  // ---------- Toasts ----------
  function toast(message, type = 'info') {
    const root = $('toastRoot');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = '<i></i><span></span>';
    el.querySelector('span').textContent = message;
    root.append(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 320); }, TOAST_MS);
  }

  // ---------- Modal genérico ----------
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

  function trapModalFocus(e) {
    if (e.key !== 'Tab') return;
    const items = [...e.currentTarget.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openModal(title, ...content) {
    const { h } = window.Views;
    const root = $('modalRoot');
    if (!root.classList.contains('is-open')) state.returnFocus = document.activeElement;
    root.replaceChildren(
      h('div', { class: 'modal-backdrop', on: { click: closeModal } }),
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, on: { keydown: trapModalFocus } },
        h('div', { class: 'modal-head' }, h('h2', { text: title }), h('button', { type: 'button', class: 'modal-close', 'aria-label': 'Cerrar', html: window.ICONS.icon('close'), on: { click: closeModal } })),
        ...content),
    );
    root.classList.add('is-open');
    root.querySelector('.modal-close').focus();
  }
  function closeModal() {
    const root = $('modalRoot');
    if (!root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    root.replaceChildren();
    if (state.returnFocus?.focus) state.returnFocus.focus();
  }

  const switchEl = (key, onChange) => {
    const { h } = window.Views;
    const sw = h('button', { type: 'button', class: `switch${state.settings[key] ? ' is-on' : ''}`, role: 'switch', 'aria-checked': String(state.settings[key]) });
    sw.addEventListener('click', () => {
      state.settings[key] = !state.settings[key];
      sw.classList.toggle('is-on', state.settings[key]);
      sw.setAttribute('aria-checked', String(state.settings[key]));
      persist();
      onChange?.(state.settings[key]);
      toast(window.I18N.t('settings.saved'), 'success');
    });
    return sw;
  };

  function openSettings() {
    const { t } = window.I18N;
    const { h } = window.Views;
    const row = (title, desc, control) => h('div', { class: 'setting-row' }, h('div', {}, h('div', { class: 't', text: title }), h('div', { class: 'd', text: desc })), control);
    const langSeg = h('div', { class: 'seg' }, ...[['es', 'Español'], ['en', 'English']].map(([code, label]) =>
      h('button', { type: 'button', class: `pill pill-sm${window.I18N.lang === code ? ' is-active' : ''}`, text: label, on: { click: () => {
        if (window.I18N.lang === code) return;
        window.I18N.setLang(code);
        closeModal();
        openSettings();
        toast(t('toast.langChanged'), 'success');
      } } })));
    openModal(t('settings.title'),
      h('p', { class: 'lead', text: t('settings.lead') }),
      row(t('settings.lang'), t('settings.lang.d'), langSeg),
      row(t('settings.motion'), t('settings.motion.d'), switchEl('motion', applySettings)),
      row(t('settings.voice'), t('settings.voice.d'), switchEl('voice', (on) => { if (!on) window.Voice?.silence(); })),
      row(t('settings.notif'), t('settings.notif.d'), switchEl('notif')),
      row(t('settings.email'), t('settings.email.d'), switchEl('email')),
    );
  }

  function openSupport() {
    const { t } = window.I18N;
    const { h } = window.Views;
    const faq = (q, a) => h('details', { class: 'faq' }, h('summary', { text: t(q) }), h('p', { text: t(a) }));
    openModal(t('support.title'),
      h('p', { class: 'lead', text: t('support.lead') }),
      h('div', { style: 'display:flex;gap:10px;margin:6px 0 14px;flex-wrap:wrap' },
        h('button', { type: 'button', class: 'btn', text: t('support.chat'), on: { click: () => { closeModal(); window.AIPanel.open(t('prompt.support')); } } }),
        h('a', { class: 'btn btn-outline', href: 'tel:8002266783', style: 'display:inline-flex;align-items:center;gap:8px;text-decoration:none', html: `${window.ICONS.icon('phone')}<span>${t('support.call')}</span>` })),
      faq('support.q1', 'support.a1'), faq('support.q2', 'support.a2'), faq('support.q3', 'support.a3'),
    );
  }

  // ---------- Notificaciones ----------
  function renderNotifications() {
    const { t } = window.I18N;
    const { h } = window.Views;
    const pop = $('notifPop');
    pop.replaceChildren(
      h('div', { class: 'popover-head' }, h('span', { text: t('notif.title') }), h('button', { type: 'button', text: t('notif.markRead'), on: { click: () => {
        NOTIFS.forEach((n) => state.read.add(n.id));
        persist(); renderNotifications(); updateBadge(); toast(t('toast.readAll'), 'success');
      } } })),
      ...NOTIFS.map((n) => h('div', { class: `notif${state.read.has(n.id) ? ' is-read' : ''}` }, h('span', { class: 'dot' }),
        h('div', {}, h('b', { text: t(n.t) }), h('span', { text: t(n.d) }), h('small', { text: t(n.when.key, n.when) })))),
    );
  }
  function updateBadge() {
    const unread = NOTIFS.some((n) => !state.read.has(n.id));
    $('bellDot').hidden = !unread;
  }
  function toggleNotifications() {
    const pop = $('notifPop');
    const open = !pop.classList.contains('is-open');
    if (open) renderNotifications();
    pop.classList.toggle('is-open', open);
    $('bellBtn').setAttribute('aria-expanded', String(open));
  }
  function closeNotifications() {
    $('notifPop').classList.remove('is-open');
    $('bellBtn').setAttribute('aria-expanded', 'false');
  }

  function init() {
    load();
    applySettings();
    updateBadge();
    $('bellBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleNotifications(); });
    $('gearBtn').addEventListener('click', openSettings);
    $('profileBtn').addEventListener('click', openSettings);
    $('settingsBtn').addEventListener('click', openSettings);
    $('supportBtn').addEventListener('click', openSupport);
    document.addEventListener('click', (e) => { if (!e.target.closest('.notif-wrap')) closeNotifications(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeNotifications(); } });
  }

  window.Modals = { init, toast, openSettings, openSupport, closeModal, get settings() { return state.settings; } };
})();

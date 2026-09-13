// Portada de banca en línea: saludo, cuenta principal, accesos rápidos,
// movimientos, alertas y favoritos.
//
// Todo lo que se pinta aquí viene de /api/overview, que exige sesión. La página
// no inventa saldos: si la API falla, se muestra el banner y se deja el
// esqueleto, nunca un número inventado.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el, toast } = window.UI;

  // Accesos rápidos. El asistente va primero y marcado: es la puerta a la parte
  // generativa del producto, no un trámite más. Los demás son los del banco
  // real y todavía no tienen pantalla, así que avisan en lugar de mentir.
  const QUICK_ACTIONS = [
    { id: 'asistente', icon: 'sparkle', key: 'portal.quick.assistant', href: '/asistente', featured: true },
    { id: 'transferir', icon: 'transfer', key: 'portal.quick.transfer' },
    { id: 'servicios', icon: 'receipt', key: 'portal.quick.services' },
    { id: 'tarjeta', icon: 'card', key: 'portal.quick.card' },
    { id: 'recarga', icon: 'smartphone', key: 'portal.quick.topup' },
    { id: 'retiro', icon: 'cash', key: 'portal.quick.withdraw' },
    { id: 'mas', icon: 'dots', key: 'portal.quick.more' },
  ];

  const ALERT_ICONS = { critical: 'alert', warn: 'info', info: 'info', ok: 'check' };

  // ---------- Saludo ----------
  function renderGreeting(user) {
    const { t, fmtLongDate } = window.I18N;
    const name = user?.preferredName ?? user?.fullName ?? '';
    $('greetTitle').textContent = name ? t('portal.greet.hello', { name }) : t('portal.greet.plain');
    $('greetDate').textContent = fmtLongDate(new Date());
  }

  // ---------- Cuenta principal ----------
  // La cuenta de la que se habla es la de nómina; si no hay, la primera que no
  // sea una tarjeta de crédito (un saldo negativo no es un buen "hola").
  function primaryAccount(accounts) {
    return accounts.find((a) => a.type === 'checking')
      ?? accounts.find((a) => a.type !== 'credit')
      ?? accounts[0]
      ?? null;
  }

  function renderBalance(account) {
    if (!account) return;
    $('balanceName').textContent = account.name;
    $('balanceNumber').textContent = account.number ?? '';
    $('balanceAmount').textContent = window.I18N.fmtMoney(account.availableBalance ?? account.balance);
  }

  // ---------- Accesos rápidos ----------
  function renderQuickActions() {
    const { t } = window.I18N;
    const nodes = QUICK_ACTIONS.map((action, index) => {
      const node = el(action.href ? 'a' : 'button', `quick-item${action.featured ? ' is-featured' : ''}`);
      node.dataset.anim = '';
      node.style.setProperty('--i', String(index));
      if (action.href) node.href = action.href;
      else node.type = 'button';

      const badge = el('span', 'quick-icon');
      badge.append(window.ICONS.el(action.icon));
      node.append(badge, el('span', 'quick-label', t(action.key)));

      if (action.featured) node.append(el('span', 'quick-tag', t('portal.quick.assistant.tag')));
      else node.addEventListener('click', () => toast(t('portal.soon', { action: t(action.key) })));
      return node;
    });
    $('quick').replaceChildren(...nodes);
  }

  // ---------- Movimientos ----------
  // El saldo por renglón no viene de la API: se reconstruye hacia atrás desde el
  // saldo actual de cada cuenta, que es lo que se espera ver en un estado de
  // cuenta. Se lleva una cuenta corriente por cuenta porque la lista las mezcla.
  function balancesByTransaction(accounts, transactions) {
    const running = new Map(accounts.map((account) => [account.id, account.balance]));
    const result = new Map();
    for (const tx of transactions) {
      if (!running.has(tx.accountId)) continue;
      const after = running.get(tx.accountId);
      result.set(tx.id, after);
      running.set(tx.accountId, after - tx.amount);
    }
    return result;
  }

  function renderMovements(accounts, transactions) {
    const { fmtMoney, fmtShortDate } = window.I18N;
    const balances = balancesByTransaction(accounts, transactions);

    const rows = transactions.map((tx, index) => {
      const row = el('tr');
      row.dataset.anim = '';
      row.style.setProperty('--i', String(index));

      const date = el('td', 'mv-date');
      const mark = el('span', `mv-mark ${tx.amount < 0 ? 'is-out' : 'is-in'}`);
      mark.append(window.ICONS.el(tx.amount < 0 ? 'transfer' : 'wallet'));
      date.append(mark, el('span', null, fmtShortDate(tx.date)));

      const description = el('td', 'mv-desc');
      description.append(el('span', 'mv-title truncate', tx.description), el('span', 'mv-cat', tx.category));

      const sign = tx.amount < 0 ? '−' : '+';
      row.append(
        date,
        description,
        el('td', 'mv-ref num', tx.id.replace('TX-', '')),
        el('td', `mv-amount num ta-right ${tx.amount < 0 ? 'neg' : 'pos'}`, `${sign} ${fmtMoney(Math.abs(tx.amount))}`),
        el('td', 'mv-balance num ta-right', balances.has(tx.id) ? fmtMoney(balances.get(tx.id)) : '—'),
      );
      return row;
    });
    $('movementsBody').replaceChildren(...rows);
  }

  // ---------- Alertas ----------
  function renderAlerts(alerts) {
    const { t, fmtMoney, fmtWhen } = window.I18N;
    if (!alerts.length) {
      $('alerts').replaceChildren(el('li', 'alerts-empty', t('portal.alerts.empty')));
      return;
    }
    const items = alerts.map((alert, index) => {
      const item = el('li', `alert alert-${alert.level}`);
      item.dataset.anim = '';
      item.style.setProperty('--i', String(index));

      const badge = el('span', 'alert-icon');
      badge.append(window.ICONS.el(ALERT_ICONS[alert.level] ?? 'info'));

      const body = el('div', 'alert-body');
      body.append(el('p', 'alert-title', alert.title));
      // Cantidad, contexto y cuándo — en ese orden y solo lo que exista.
      const detail = [
        alert.amount !== undefined ? fmtMoney(alert.amount) : null,
        alert.detail,
        alert.at ? fmtWhen(alert.at) : null,
      ].filter(Boolean).join(' · ');
      if (detail) body.append(el('p', 'alert-detail', detail));

      item.append(badge, body);
      return item;
    });
    $('alerts').replaceChildren(...items);
  }

  // ---------- Favoritos ----------
  function renderFavorites(favorites) {
    const { t } = window.I18N;
    const items = favorites.slice(0, 3).map((person, index) => {
      const item = el('li', 'fav');
      item.dataset.anim = '';
      item.style.setProperty('--i', String(index));

      const button = el('button', 'fav-btn');
      button.type = 'button';
      const avatar = el('span', 'fav-avatar');
      avatar.append(window.ICONS.el('user'));
      button.append(avatar, el('span', 'fav-name truncate', person.alias ?? person.name), el('span', 'fav-bank truncate', person.bank));
      button.addEventListener('click', () => toast(t('portal.favorites.toast', { name: person.name })));

      item.append(button);
      return item;
    });

    const add = el('li', 'fav');
    const addButton = el('button', 'fav-btn is-add');
    addButton.type = 'button';
    const plus = el('span', 'fav-avatar');
    plus.append(window.ICONS.el('plus'));
    addButton.append(plus, el('span', 'fav-name', t('portal.favorites.add')));
    addButton.addEventListener('click', () => toast(t('portal.soon', { action: t('portal.favorites.add') })));
    add.append(addButton);

    $('favorites').replaceChildren(...items, add);
  }

  // ---------- Arranque ----------
  function wireChrome() {
    const { t } = window.I18N;
    $('locationBtn').addEventListener('click', () => toast(t('top.location.toast')));
    $('contactBtn').addEventListener('click', () => toast(t('top.contact.toast')));
    $('exitBtn').addEventListener('click', () => window.Session.signOut());
    $('promoBtn').addEventListener('click', () => toast(t('portal.promo.toast')));
    $('securityBtn').addEventListener('click', () => toast(t('portal.security.toast')));
    $('seeMovements').addEventListener('click', () => $('movements').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    for (const id of ['allMovements', 'allAlerts', 'allFavorites']) {
      $(id).addEventListener('click', () => toast(t('portal.soon', { action: t('portal.all') })));
    }
  }

  async function load() {
    try {
      const { data } = await window.API.fetchOverview();
      renderGreeting(data.user);
      renderBalance(primaryAccount(data.accounts));
      renderMovements(data.accounts, data.transactions);
      renderAlerts(data.alerts);
      renderFavorites(data.favorites);
      window.UI.hideBanner();
    } catch (err) {
      // Un 401 ya mandó a la persona al login desde el cliente HTTP; lo que
      // llega aquí es un fallo real de la API.
      console.error('[inicio] error:', err);
      window.UI.banner(window.I18N.t('portal.error'), load);
    }
  }

  function boot() {
    if (!window.Session.requireSession()) return;

    window.ICONS.fill();
    window.I18N.apply();
    // El nombre de la sesión ya está guardado: se saluda sin esperar a la red.
    renderGreeting(window.Session.user());
    renderQuickActions();
    wireChrome();
    document.getElementById('app').classList.add('is-ready');
    load();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

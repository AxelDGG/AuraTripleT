// Arranque de la web: monta los módulos, carga el historial desde Tiger Data y
// conecta la barra superior y los atajos de teclado.
(function () {
  const $ = (id) => document.getElementById(id);

  async function loadCustomer() {
    try {
      const body = await fetch('/api/customer').then((r) => r.json());
      const customer = body?.data;
      if (!customer?.name) throw new Error('sin perfil');
      $('customerName').textContent = customer.segment
        ? `${customer.name} · ${customer.segment}`
        : customer.name;
    } catch {
      // El nombre es decorativo: si no llega, la franja se queda con el estado
      // del agente y la app sigue funcionando igual.
      $('customerName').textContent = 'Banca en línea';
    }
  }

  // Chip con la fuente del historial: deja ver en la demo si está leyendo de
  // Tiger Data o si cayó al modo en memoria.
  function showSource(source) {
    const chip = $('sourceChip');
    if (!source) return;
    chip.hidden = false;
    chip.textContent = source === 'tiger' ? 'TIGER DATA' : 'EN MEMORIA';
  }

  function wireTopbar() {
    const { t } = window.I18N;
    $('locationBtn').addEventListener('click', () => window.UI.toast(t('top.location.toast')));
    $('contactBtn').addEventListener('click', () => window.UI.toast(t('top.contact.toast')));
    $('exitBtn').addEventListener('click', () => {
      window.Voice?.stop();
      window.Voice?.silence();
      window.UI.toast(t('exit.confirm'));
    });
  }

  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      // "/" enfoca el composer; Ctrl/Cmd+K, el buscador del riel.
      if (e.key === '/' && !typing) { e.preventDefault(); $('composerInput').focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('railSearch').focus(); }
    });
  }

  async function boot() {
    window.ICONS.fill();
    window.I18N.apply();
    window.UI.init();
    window.Agent.init();
    window.History.init({ onOpen: (entry) => window.Agent.showEntry(entry) });

    document.getElementById('app').classList.add('is-ready');
    wireTopbar();
    wireKeys();

    const [, history] = await Promise.all([loadCustomer(), window.History.load()]);
    showSource(history?.source);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

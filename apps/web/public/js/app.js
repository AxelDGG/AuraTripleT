// Arranque del asistente: monta los módulos, carga el historial desde Tiger Data
// y conecta la barra superior y los atajos de teclado.
//
// La página es privada: sin sesión se va al login antes de montar nada, igual
// que la portada.
(function () {
  const $ = (id) => document.getElementById(id);

  async function loadCustomer() {
    try {
      const { data: customer } = await window.API.fetchCustomer();
      if (!customer?.name) throw new Error('sin perfil');
      $('customerName').textContent = customer.name;
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
    // Salir cierra la sesión de verdad: el micrófono se calla primero para que
    // no siga grabando mientras cambia la página.
    $('exitBtn').addEventListener('click', () => {
      window.Voice?.stop();
      window.Voice?.silence();
      window.Session.signOut();
    });
  }

  function wireSuggestToggle() {
    const btn = $('suggestToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.querySelector('.workspace')?.classList.toggle('suggest-visible');
    });
  }

  function wireRail() {
    const toggleBtn = document.getElementById('railToggle');
    const openBtn = document.getElementById('railOpenBtn');
    const resizeHandle = document.getElementById('railResize');
    const rail = document.getElementById('rail');
    const backdrop = document.getElementById('railBackdrop');
    if (!rail) return;

    const COLLAPSED_W = 60;
    const MIN_W = 240;
    const MAX_W = 360;
    const mq = window.matchMedia('(max-width: 767px)');
    let savedW = 0;

    function maxW() { return Math.min(MAX_W, Math.floor(window.innerWidth * 0.30)); }
    function initSavedW() { if (!savedW) savedW = Math.max(MIN_W, rail.offsetWidth); }

    function openDrawer() {
      rail.classList.add('is-drawer-open');
      backdrop?.classList.add('is-visible');
    }

    function closeDrawer() {
      rail.classList.remove('is-drawer-open');
      backdrop?.classList.remove('is-visible');
    }

    function collapseRail() {
      initSavedW();
      savedW = Math.max(MIN_W, rail.offsetWidth);
      rail.style.width = '';
      rail.classList.add('is-collapsed');
    }

    function expandRail() {
      initSavedW();
      rail.classList.remove('is-collapsed');
      rail.style.width = Math.min(savedW, maxW()) + 'px';
    }

    toggleBtn?.addEventListener('click', () => {
      if (mq.matches) { closeDrawer(); }
      else if (rail.classList.contains('is-collapsed')) { expandRail(); }
      else { collapseRail(); }
    });

    openBtn?.addEventListener('click', openDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mq.matches && rail.classList.contains('is-drawer-open')) {
        closeDrawer();
      }
    });

    mq.addEventListener('change', () => {
      if (!mq.matches) {
        backdrop?.classList.remove('is-visible');
        rail.classList.remove('is-drawer-open');
      } else {
        rail.classList.remove('is-collapsed');
        rail.style.width = '';
        closeDrawer();
      }
    });

    // ---------- Drag-to-resize ----------
    if (!resizeHandle) return;

    let startX = 0, startW = 0;

    function onMouseMove(e) {
      const dx = startX - e.clientX;
      const newW = Math.min(maxW(), Math.max(MIN_W, startW + dx));
      rail.style.width = newW + 'px';
      savedW = newW;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      resizeHandle.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      rail.style.transition = '';
    }

    resizeHandle.addEventListener('mousedown', (e) => {
      if (mq.matches || rail.classList.contains('is-collapsed')) return;
      e.preventDefault();
      initSavedW();
      startX = e.clientX;
      startW = rail.offsetWidth;
      resizeHandle.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      rail.style.transition = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function wireHelp() {
    const CONTENT = {
      suggest: {
        title: 'Visualizaciones sugeridas',
        text: 'Atajos a las consultas más útiles. Haz clic en una tarjeta y el agente genera la gráfica automáticamente.',
      },
      composer: {
        title: 'Chat con el agente',
        text: 'Escribe tu pregunta financiera o usa el micrófono para dictar. El botón de audífonos abre a Maya, la IA conversacional.',
      },
      history: {
        title: 'Historial y colección',
        text: 'Aquí aparecen todas las visualizaciones que generaste. La pestaña COLECCIÓN las agrupa por tema para encontrarlas fácil.',
      },
      canvas: {
        title: 'Cómo empezar',
        text: 'Elige una visualización sugerida arriba o escribe tu pregunta directamente en la caja de texto.',
      },
    };

    let activePopover = null;
    let activeBtn = null;

    function closePopover() {
      if (!activePopover) return;
      activePopover.classList.add('is-closing');
      const pop = activePopover;
      activePopover = null;
      activeBtn = null;
      setTimeout(() => pop.remove(), 150);
    }

    function openPopover(btn) {
      if (activeBtn === btn) { closePopover(); return; }
      closePopover();

      const info = CONTENT[btn.dataset.help];
      if (!info) return;

      const pop = document.createElement('div');
      pop.className = 'help-popover';
      pop.setAttribute('role', 'tooltip');

      const heading = document.createElement('strong');
      heading.textContent = info.title;
      pop.append(heading, document.createTextNode(info.text));
      document.body.append(pop);

      const rect = btn.getBoundingClientRect();
      const popW = Math.min(260, window.innerWidth - 16);
      const popH = pop.offsetHeight || 80;
      let left = rect.left;
      let top = rect.bottom + 8;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      if (left < 8) left = 8;
      if (top + popH > window.innerHeight - 8) top = rect.top - popH - 8;
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';

      activePopover = pop;
      activeBtn = btn;
    }

    // Delegación: cubre botones creados dinámicamente (ej. canvas-info-btn)
    document.addEventListener('click', (e) => {
      const helpBtn = e.target.closest('.help-btn');
      if (helpBtn) { e.stopPropagation(); openPopover(helpBtn); return; }
      closePopover();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activePopover) { closePopover(); return; }
      const focused = document.activeElement;
      if (focused?.classList.contains('help-btn') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); openPopover(focused);
      }
    });
  }

  function wireConvAI() {
    const btn = document.getElementById('mayaBtn');
    if (!btn) return;

    let panel = null;
    let bubble = null;
    let active = false;

    function loadWidgetScript() {
      return new Promise((resolve, reject) => {
        if (customElements.get('elevenlabs-convai')) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://elevenlabs.io/convai-widget/index.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('No se pudo cargar el widget de ElevenLabs'));
        document.head.append(s);
      });
    }

    function setActive(on) {
      active = on;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-active', on);
    }

    function stopMaya() {
      if (panel) {
        const cleanup = panel._cleanup;
        panel.remove();
        panel = null;
        if (cleanup) cleanup();
      }
      setActive(false);
    }

    async function startMaya() {
      if (panel) {
        panel.hidden = false;
        if (bubble) bubble.hidden = false;
        setActive(true);
        return;
      }

      // Cargar el script del widget la primera vez que el usuario abre Maya
      try {
        await loadWidgetScript();
      } catch (err) {
        window.UI.toast('Maya: ' + err.message, 'error');
        return;
      }

      let agentId = '';
      try {
        // Con la sesión: si AUTH_REQUIRED está activo, la ruta pide token como el resto.
        const r = await fetch('/api/voice/convai-token', { headers: window.Session?.headers() ?? {} });
        const text = await r.text();
        let d;
        try { d = JSON.parse(text); } catch {
          throw new Error('Reinicia el servidor e intenta de nuevo.');
        }
        if (!r.ok) throw new Error(d.error ?? 'Error al obtener configuración');
        agentId = d.agentId;
        if (!agentId) throw new Error('El servidor no devolvió un agent ID.');
      } catch (err) {
        window.UI.toast('Maya: ' + err.message, 'error');
        return;
      }

      // Crear el widget de ElevenLabs con el agent-id
      panel = document.createElement('div');
      panel.className = 'maya-panel';
      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', agentId);
      widget.setAttribute('language', 'es');
      widget.setAttribute('listening-text', 'Escuchándote…');
      widget.setAttribute('speaking-text', 'Maya hablando…');
      widget.setAttribute('avatar-image-url', '/img/User.png');
      widget.setAttribute('avatar-orb-color-1', '#eb0029');
      widget.setAttribute('avatar-orb-color-2', '#9e0018');
      panel.append(widget);
      document.body.append(panel);
      setActive(true);

      // Burbuja animada del agente: orbe con avatar, ecualizador y estado
      bubble = document.createElement('div');
      bubble.className = 'maya-bubble is-connecting';
      const orb = document.createElement('div');
      orb.className = 'maya-bubble-orb';
      const rings = [...Array(2)].map((_, i) => {
        const r = document.createElement('span');
        r.className = 'maya-bubble-ring' + (i ? ' r2' : '');
        return r;
      });
      const eq = document.createElement('span');
      eq.className = 'maya-bubble-eq';
      eq.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
      const img = document.createElement('img');
      img.src = '/img/User.png';
      img.alt = '';
      orb.append(...rings, img, eq);
      const txt = document.createElement('span');
      txt.className = 'maya-bubble-txt';
      txt.innerHTML = '<strong>Maya</strong><span data-bubble-status>Conectando…</span>';
      bubble.append(orb, txt);
      document.body.append(bubble);

      const statusEl = txt.querySelector('[data-bubble-status]');
      const setBubbleState = (state, label) => {
        bubble.classList.toggle('is-connecting', state === 'connecting');
        bubble.classList.toggle('is-listening', state === 'listening');
        bubble.classList.toggle('is-speaking', state === 'speaking');
        if (statusEl.textContent !== label) statusEl.textContent = label;
      };

      // El widget muestra su estado en su shadow DOM; lo leemos para animar
      // la burbuja en sincronía con él.
      const poller = setInterval(() => {
        if (!panel || panel.hidden) return;
        const text = widget.shadowRoot?.textContent ?? '';
        if (/Maya hablando|Speaking|interrupt/i.test(text)) {
          setBubbleState('speaking', 'Hablando…');
        } else if (/Escuchándote|Listening/i.test(text)) {
          setBubbleState('listening', 'Escuchándote…');
        } else if (/Denied|denied/i.test(text)) {
          setBubbleState('connecting', 'Activa el micrófono');
        } else if (/Error|Reconnect/i.test(text)) {
          setBubbleState('connecting', 'Intentando de nuevo…');
        } else {
          setBubbleState('connecting', 'Conectando…');
        }
      }, 350);

      // El widget pide aceptar términos y picar "Start a call". Como el usuario
      // ya abrió Maya, iniciamos la llamada automáticamente.
      const autoStart = () => {
        let tries = 0;
        const tick = () => {
          if (tries++ > 12 || !panel || panel.hidden) return;
          const root = widget.shadowRoot;
          if (!root) return;
          const live = /Escuchándote|Maya hablando|Listening|Speaking|interrupt/i.test(root.textContent ?? '');
          if (live) return;
          const visible = (btn) => !btn.disabled && (btn.offsetParent !== null || btn.offsetWidth > 0);
          const btns = [...root.querySelectorAll('button')];
          const labels = btns.map((b) => (b.textContent || '').trim());
          let clicked = false;
          for (let i = 0; i < btns.length && !clicked; i++) {
            if (/^agree$|^aceptar$|^acepto$/i.test(labels[i]) && visible(btns[i])) btns[i].click();
            else if (/start a call|begin|iniciar|empezar/i.test(labels[i]) && visible(btns[i])) btns[i].click();
            else continue;
            clicked = true;
          }
          setTimeout(tick, 400);
        };
        setTimeout(tick, 500);
      };
      autoStart();

      // Posicionar la burbuja sobre el botón Maya (el widget flota en su esquina)
      function reposition() {
        if (!panel || panel.hidden) return;
        const rect = btn.getBoundingClientRect();
        panel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        panel.style.right = (window.innerWidth - rect.right) + 'px';
        panel.style.left = 'auto';
        bubble.style.bottom = (window.innerHeight - rect.top + 48) + 'px';
        bubble.style.right = (window.innerWidth - rect.right - 8) + 'px';
      }
      reposition();
      window.addEventListener('resize', reposition);
      panel._cleanup = () => {
        clearInterval(poller);
        window.removeEventListener('resize', reposition);
        bubble.remove();
      };
    }

    btn.addEventListener('click', () => {
      if (active) stopMaya();
      else startMaya();
    });
  }

  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      // "/" enfoca el composer; Ctrl/Cmd+K, el buscador del riel.
      if (e.key === '/' && !typing) { e.preventDefault(); $('composerInput').focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('railSearch').focus(); }
      // Ctrl/Cmd+1 y +2 saltan entre las dos pestañas del riel sin usar el ratón.
      if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.key === '2')) {
        e.preventDefault();
        window.History.selectTab(e.key === '1' ? 'history' : 'collection');
      }
    });
  }

  async function boot() {
    if (!window.Session.requireSession()) return;

    window.ICONS.fill();
    window.I18N.apply();
    window.UI.init();
    window.Agent.init();
    window.History.init({ onOpen: (entry) => window.Agent.showEntry(entry) });
    window.Suggest.init();

    document.getElementById('app').classList.add('is-ready');
    wireTopbar();
    wireSuggestToggle();
    wireRail();
    wireHelp();
    wireConvAI();
    wireKeys();

    const [, history] = await Promise.all([loadCustomer(), window.History.load()]);
    showSource(history?.source);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

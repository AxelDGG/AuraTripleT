// Tarjetas de sugerencias sobre el lienzo: atajos a las visualizaciones que el
// agente construye mejor. Cada tarjeta manda un prompt ya redactado, así que la
// primera pregunta no depende de que el usuario sepa cómo pedirla.
//
// `folder` es a qué carpeta suele ir a parar esa visualización: se muestra como
// chip para que se entienda de entrada cómo se archiva lo que se genera.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  const SUGGESTIONS = [
    { id: 'reestructura', icon: 'chartDebt', folder: 'promociones' },
    { id: 'gastos', icon: 'chartBar', folder: 'gastos' },
    { id: 'ganancias', icon: 'chartLine', folder: 'movimientos' },
    { id: 'flujo', icon: 'chartArea', folder: 'movimientos' },
    { id: 'reparto', icon: 'chartPie', folder: 'movimientos' },
    { id: 'comparativo', icon: 'chartStack', folder: 'gastos' },
    { id: 'saldos', icon: 'chartKpi', folder: 'movimientos' },
    { id: 'tarjeta', icon: 'chartProgress', folder: 'movimientos' },
    { id: 'credito', icon: 'chartAmort', folder: 'promociones' },
    { id: 'fx', icon: 'chartFx', folder: 'otros' },
  ];

  function buildCard(item, index) {
    const { t } = window.I18N;
    const li = el('li');
    const card = el('button', 'sg-card');
    card.type = 'button';
    card.style.setProperty('--i', String(index));
    card.dataset.id = item.id;

    const tile = el('span', 'sg-icon');
    tile.append(window.ICONS.el(item.icon));

    const body = el('span', 'sg-body');
    body.append(el('span', 'sg-title', t(`suggest.${item.id}.title`)));
    body.append(el('span', 'sg-hint', t(`suggest.${item.id}.hint`)));

    card.append(tile, body, el('span', 'sg-tag', t(`folder.${item.folder}`)));
    card.addEventListener('click', () => {
      if (window.Agent.isBusy) return;
      window.Agent.send(t(`suggest.${item.id}.prompt`), { newThread: true });
    });

    li.append(card);
    return li;
  }

  function render() {
    const track = $('suggestTrack');
    const fragment = document.createDocumentFragment();
    SUGGESTIONS.forEach((item, i) => fragment.append(buildCard(item, i)));
    track.replaceChildren(fragment);
  }

  // Las flechas se apagan en los extremos: si no hay a dónde avanzar, el botón
  // no debe invitar a intentarlo.
  function updateNav() {
    const viewport = $('suggestTrack').parentElement;
    const scrollable = viewport.scrollWidth - viewport.clientWidth > 2;
    $('suggestPrev').disabled = !scrollable || viewport.scrollLeft <= 2;
    $('suggestNext').disabled = !scrollable || viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
  }

  function scrollBy(direction) {
    const viewport = $('suggestTrack').parentElement;
    const card = viewport.querySelector('.sg-card');
    // Se avanza de dos en dos tarjetas; si aún no hay ninguna, media ventana.
    const step = card ? (card.offsetWidth + 10) * 2 : viewport.clientWidth * 0.6;
    viewport.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  function init() {
    render();
    $('suggestPrev').addEventListener('click', () => scrollBy(-1));
    $('suggestNext').addEventListener('click', () => scrollBy(1));
    $('suggestTrack').parentElement.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);
    requestAnimationFrame(updateNav);
  }

  window.Suggest = { init, render };
})();

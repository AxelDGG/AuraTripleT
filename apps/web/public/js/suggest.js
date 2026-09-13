// Tarjetas de sugerencias sobre el lienzo: atajos a las visualizaciones que el
// agente construye mejor. Cada tarjeta manda un prompt ya redactado, así que la
// primera pregunta no depende de que el usuario sepa cómo pedirla.
//
// `folder` es a qué carpeta suele ir a parar esa visualización: se muestra como
// chip para que se entienda de entrada cómo se archiva lo que se genera.
//
// La fila no es solo de gráficas: van mezcladas las pantallas de calendario,
// tabla y formulario que el agente también sabe armar, y van interpoladas a
// propósito para que las primeras tarjetas visibles ya muestren esa variedad.
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = window.UI;

  const SUGGESTIONS = [
    { id: 'reestructura', icon: 'chartDebt', folder: 'promociones' },
    { id: 'gastos', icon: 'chartBar', folder: 'gastos' },
    { id: 'agenda', icon: 'chartCalendar', folder: 'transacciones' },
    { id: 'tendencia', icon: 'chartTrend', folder: 'gastos' },
    { id: 'ganancias', icon: 'chartLine', folder: 'movimientos' },
    { id: 'movimientos', icon: 'chartTable', folder: 'movimientos' },
    { id: 'flujo', icon: 'chartArea', folder: 'movimientos' },
    { id: 'transferir', icon: 'chartForm', folder: 'transacciones' },
    { id: 'reparto', icon: 'chartPie', folder: 'movimientos' },
    { id: 'suscripciones', icon: 'chartRepeat', folder: 'gastos' },
    { id: 'comparativo', icon: 'chartStack', folder: 'gastos' },
    { id: 'semana', icon: 'chartAgenda', folder: 'otros' },
    { id: 'saldos', icon: 'chartKpi', folder: 'movimientos' },
    { id: 'inversiones', icon: 'chartRing', folder: 'otros' },
    { id: 'tarjeta', icon: 'chartProgress', folder: 'movimientos' },
    { id: 'recordatorio', icon: 'chartDate', folder: 'transacciones' },
    { id: 'credito', icon: 'chartAmort', folder: 'promociones' },
    { id: 'mercado', icon: 'chartSpark', folder: 'otros' },
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

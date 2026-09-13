// Catálogo de gráficas de Norte y versión del contrato v1.
//
// El catálogo de COMPONENTES vive en core/catalog-v2.js: es el único que el
// agente lee. Aquí queda lo de las gráficas, que v1 y v2 comparten (el
// componente se llama `chart` en uno y `Chart` en el otro, con los mismos
// chartType), y la versión del contrato v1 que todavía usa el historial.
//
// Cada entrada dice para qué sirve la gráfica (`when`) y, solo cuando su forma
// de datos no es la de siempre, cómo se le pasan (`dataHint`). De aquí sale la
// sección del prompt; no hay una segunda copia escrita a mano.

export const SPEC_VERSION = 'norte-ui-spec/v1';

// Los tipos y sus nombres siguen el vocabulario de Bklit UI
// (https://bklit.com/docs), que es la librería de referencia del proyecto.
export const CHART_GUIDE = [
  {
    type: 'bar',
    when: 'comparar categorías o periodos entre sí',
  },
  {
    type: 'stacked_bar',
    when: 'la composición dentro de cada periodo (gasto por categoría, mes a mes)',
  },
  {
    type: 'horizontal_bar',
    when: 'un ranking, sobre todo con nombres largos (top comercios, top categorías)',
  },
  {
    type: 'line',
    when: 'la tendencia de un valor en el tiempo',
  },
  {
    type: 'area',
    when: 'una tendencia donde importa el volumen acumulado (saldo, ahorro acumulado)',
  },
  {
    type: 'composed',
    when: 'mezclar magnitudes distintas: barras de monto más una línea de promedio o tendencia',
    dataHint: 'kind bar|line|area y axis:"right" en la serie de otra escala',
  },
  {
    type: 'pie',
    when: 'el reparto de un total con pocas rebanadas (máximo 6)',
  },
  {
    type: 'doughnut',
    when: 'lo mismo que pie, cuando el reparto acompaña a un total ya mostrado en un KPI',
  },
  {
    type: 'ring',
    when: 'el avance de UNA meta (ahorro, pago de un crédito, presupuesto consumido)',
    dataHint: 'value+max+label sin datasets',
  },
  {
    type: 'gauge',
    when: 'un indicador contra su límite o su rango sano (uso de línea de crédito, score)',
    dataHint: 'value+max+label sin datasets',
  },
  {
    type: 'radar',
    when: 'comparar un perfil de varias dimensiones (tus hábitos contra el mes pasado)',
  },
  {
    type: 'scatter',
    when: 'la relación entre dos variables (monto contra frecuencia de compra)',
    dataHint: 'data:[{x,y}]',
  },
  {
    type: 'funnel',
    when: 'etapas que se van reduciendo (ingreso → gastos fijos → variables → disponible)',
  },
  {
    type: 'heatmap',
    when: 'intensidad cruzando dos ejes (gasto por día de la semana a lo largo del mes)',
    dataHint: 'un dataset por fila',
  },
  {
    type: 'candlestick',
    when: 'un precio o saldo con apertura, máximo, mínimo y cierre',
    dataHint: 'data:[{o,h,l,c}]',
  },
  {
    type: 'profit_loss',
    when: 'un resultado que cruza el cero (flujo neto mes a mes, utilidad)',
  },
];

export const CHART_TYPE_IDS = CHART_GUIDE.map((c) => c.type);

// Opciones que aplican a cualquier gráfica, más allá del tipo.
const CHART_OPTIONS =
  'Opciones: format currency|percent|number|compact (percent solo si ya son porcentajes), unit, target+targetLabel (referencia), stacked, legend:false con una sola serie, subtitle, caption, color solo si comunica algo.';

// Cómo elegir entre ellas. Una regla por idea, en el orden en que se decide.
const CHART_RULES =
  'Elige por la pregunta: reparto → doughnut (≤6 rebanadas, si no horizontal_bar ordenada); meta o límite → ring/gauge, nunca una barra suelta; tiempo → line/area (profit_loss si cruza cero); nunca pie con negativos; pesos + porcentaje → composed con axis:"right". Una gráfica que comunica vale más que tres; si la tabla ya lo dice, no grafiques.';

// Bloque del prompt A2UI. Es compacto a propósito: compite con las tools y sus
// resultados por el presupuesto de tokens por minuto del orquestador.
export function chartsPromptSectionCompact() {
  const special = CHART_GUIDE.filter((c) => c.dataHint).map((c) => `${c.type}: ${c.dataHint}`);
  return [
    `GRÁFICAS (chartType de Chart): ${CHART_GUIDE.map((c) => `${c.type}: ${c.when}`).join(' · ')}.`,
    `Datos: "labels" + "datasets" numéricos; ${special.join('; ')}.`,
    CHART_OPTIONS,
    CHART_RULES,
  ].join('\n');
}

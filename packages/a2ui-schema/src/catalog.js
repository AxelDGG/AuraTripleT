// Catálogo de componentes de Norte UI Spec v1.
// Es la única fuente de verdad de qué componentes existen y cómo se le
// describen al modelo: el SYSTEM_PROMPT del agente se construye desde aquí.

export const SPEC_VERSION = 'norte-ui-spec/v1';

export const COMPONENT_CATALOG = [
  {
    type: 'header',
    example: '{"type":"header","title":"...","subtitle":"...","badge":"..."}',
    hint: 'encabezado de la vista.',
  },
  {
    type: 'kpi_grid',
    example: '{"type":"kpi_grid","items":[{"label":"...","value":"$48,250.75","delta":"+12%","trend":"up|down|neutral","icon":"💰"}]}',
    hint: 'métricas clave (2-4 items).',
  },
  {
    type: 'balance_cards',
    example: '{"type":"balance_cards","accounts":[{"name":"...","number":"**** 4821","balance":48250.75,"currency":"MXN","kind":"checking|savings|credit","extra":"texto opcional"}]}',
    hint: 'tarjetas de cuentas.',
  },
  {
    type: 'chart',
    example: '{"type":"chart","chartType":"<ver catálogo de gráficas>","title":"...","subtitle":"...","labels":["..."],"datasets":[{"label":"...","data":[123,456]}]}',
    hint: 'gráficas; el catálogo completo de chartType y cuándo usar cada uno va más abajo.',
  },
  {
    type: 'table',
    example: '{"type":"table","title":"...","columns":["..."],"rows":[["..."]]}',
    hint: 'datos tabulares.',
  },
  {
    type: 'transaction_list',
    example: '{"type":"transaction_list","title":"...","items":[{"date":"2026-09-01","description":"...","category":"...","amount":-299.0}]}',
    hint: 'movimientos.',
  },
  {
    type: 'form',
    example: '{"type":"form","title":"...","description":"...","submitLabel":"...","action":"nombre_accion","fields":[{"name":"...","label":"...","inputType":"text|number|select","options":[{"value":"...","label":"..."}],"placeholder":"...","value":"..."}]}',
    hint: 'formularios interactivos (transferencias, simulaciones).',
  },
  {
    type: 'alert',
    example: '{"type":"alert","level":"info|success|warning|error","title":"...","text":"..."}',
    hint: 'avisos y confirmaciones.',
  },
  {
    type: 'progress',
    example: '{"type":"progress","label":"...","value":65,"caption":"..."}',
    hint: 'barra de avance simple; para una meta que merece protagonismo usa una gráfica ring.',
  },
  {
    type: 'text',
    example: '{"type":"text","markdown":"..."}',
    hint: 'texto libre breve.',
  },
];

export const COMPONENT_TYPES = COMPONENT_CATALOG.map((c) => c.type);

// Catálogo de gráficas. Los tipos y sus nombres siguen el vocabulario de
// Bklit UI (https://bklit.com/docs), que es la librería de referencia del
// proyecto; `when` y `data` son lo que el modelo necesita para elegir bien.
export const CHART_GUIDE = [
  {
    type: 'bar',
    when: 'comparar categorías o periodos entre sí',
    data: '"labels" + 1-3 "datasets" numéricos',
  },
  {
    type: 'stacked_bar',
    when: 'la composición dentro de cada periodo (gasto por categoría, mes a mes)',
    data: '"labels" + un dataset por categoría',
  },
  {
    type: 'horizontal_bar',
    when: 'un ranking, sobre todo con nombres largos (top comercios, top categorías)',
    data: '"labels" + 1 dataset, ordenado de mayor a menor',
  },
  {
    type: 'line',
    when: 'la tendencia de un valor en el tiempo',
    data: '"labels" cronológicos + 1-3 datasets',
  },
  {
    type: 'area',
    when: 'una tendencia donde importa el volumen acumulado (saldo, ahorro acumulado)',
    data: 'igual que line',
  },
  {
    type: 'composed',
    when: 'mezclar magnitudes distintas: barras de monto más una línea de promedio o tendencia',
    data: 'datasets con "kind":"bar"|"line"|"area" y "axis":"right" en la serie de otra escala',
  },
  {
    type: 'pie',
    when: 'el reparto de un total con pocas rebanadas (máximo 6)',
    data: '"labels" + 1 dataset de valores positivos',
  },
  {
    type: 'doughnut',
    when: 'lo mismo que pie, cuando el reparto acompaña a un total ya mostrado en un KPI',
    data: '"labels" + 1 dataset',
  },
  {
    type: 'ring',
    when: 'el avance de UNA meta (ahorro, pago de un crédito, presupuesto consumido)',
    data: '"value" + "max" + "label", sin datasets',
  },
  {
    type: 'gauge',
    when: 'un indicador contra su límite o su rango sano (uso de línea de crédito, score)',
    data: '"value" + "max" + "label", sin datasets',
  },
  {
    type: 'radar',
    when: 'comparar un perfil de varias dimensiones (tus hábitos contra el mes pasado)',
    data: '"labels" = dimensiones + 1-3 datasets',
  },
  {
    type: 'scatter',
    when: 'la relación entre dos variables (monto contra frecuencia de compra)',
    data: 'datasets con "data":[{"x":12,"y":340}]',
  },
  {
    type: 'funnel',
    when: 'etapas que se van reduciendo (ingreso → gastos fijos → variables → disponible)',
    data: '"labels" + 1 dataset descendente',
  },
  {
    type: 'heatmap',
    when: 'intensidad cruzando dos ejes (gasto por día de la semana a lo largo del mes)',
    data: '"labels" = eje horizontal + un dataset por fila',
  },
  {
    type: 'candlestick',
    when: 'un precio o saldo con apertura, máximo, mínimo y cierre',
    data: 'datasets con "data":[{"o":10,"h":12,"l":9,"c":11}]',
  },
  {
    type: 'profit_loss',
    when: 'un resultado que cruza el cero (flujo neto mes a mes, utilidad)',
    data: '"labels" + 1 dataset con valores positivos y negativos',
  },
];

export const CHART_TYPE_IDS = CHART_GUIDE.map((c) => c.type);

// Campos que aplican a cualquier gráfica, más allá del tipo.
const CHART_OPTIONS = [
  '"format": "currency" (default) | "percent" | "number" | "compact" — cómo se leen los ejes y los tooltips; usa "percent" solo si los datos YA son porcentajes.',
  '"unit": sufijo para format "number"/"compact" (p. ej. "movimientos").',
  '"target" + "targetLabel": línea punteada de referencia cuando existe presupuesto, meta o promedio.',
  '"stacked": true para apilar; "legend": false para ocultar la leyenda cuando hay una sola serie.',
  '"subtitle" y "caption": contexto corto arriba y abajo de la gráfica.',
  '"color" por dataset y "colors" por rebanada solo si un color comunica algo (verde ingreso, rojo gasto).',
];

const CHART_RULES = [
  'Elige por la pregunta, no por costumbre: "¿en qué gasto?" es reparto, "¿cómo voy?" es meta, "¿cómo va cambiando?" es tiempo.',
  'Reparto: doughnut o pie con 6 categorías o menos; con más, horizontal_bar ordenada.',
  'Meta o límite: ring o gauge, nunca una barra suelta.',
  'Tiempo: line o area; si los valores cruzan el cero, profit_loss.',
  'Nunca uses pie ni doughnut con valores negativos o con más de 6 rebanadas.',
  'Si mezclas pesos con porcentajes o con un conteo, usa composed y manda "axis":"right" en la serie de otra escala.',
  'Una gráfica que comunica vale más que tres que repiten lo mismo; si la tabla ya lo dice todo, no grafiques.',
];

// Bloque que se inserta tal cual en el prompt del agente.
export function componentsPromptSection() {
  return [
    'COMPONENTES DE UI DISPONIBLES (elige los que mejor comuniquen la respuesta, usualmente 2-5):',
    ...COMPONENT_CATALOG.map((c) => `- ${c.example} — ${c.hint}`),
  ].join('\n');
}

// Versión compacta del catálogo de gráficas (un tercio de los tokens) para el
// prompt A2UI, que compite con las tools y sus resultados por el presupuesto
// de tokens por minuto del orquestador.
export function chartsPromptSectionCompact() {
  return [
    `GRÁFICAS (chartType de Chart): ${CHART_GUIDE.map((c) => `${c.type}: ${c.when}`).join(' · ')}.`,
    'Datos: labels + datasets numéricos; scatter data:[{x,y}]; candlestick data:[{o,h,l,c}]; ring/gauge usan value+max+label sin datasets; composed lleva kind bar|line|area y axis:"right" en la serie de otra escala.',
    'Opciones: format currency|percent|number|compact (percent solo si ya son porcentajes), unit, target+targetLabel (referencia), stacked, legend:false con una sola serie, subtitle, caption.',
    'Elige por la pregunta: reparto → doughnut (≤6 rebanadas, si no horizontal_bar ordenada); meta o límite → ring/gauge; tiempo → line/area (profit_loss si cruza cero); nunca pie con negativos; pesos + porcentaje → composed. Una gráfica que comunica vale más que tres; si la tabla ya lo dice, no grafiques.',
  ].join('\n');
}

// Segundo bloque del prompt: el catálogo de gráficas y cómo escoger entre ellas.
export function chartsPromptSection() {
  return [
    'CATÁLOGO DE GRÁFICAS ("chartType" del componente chart):',
    ...CHART_GUIDE.map((c) => `- "${c.type}" — ${c.when}. Datos: ${c.data}.`),
    '',
    'OPCIONES COMUNES DE chart:',
    ...CHART_OPTIONS.map((o) => `- ${o}`),
    '',
    'CÓMO ELEGIR LA GRÁFICA:',
    ...CHART_RULES.map((r) => `- ${r}`),
  ].join('\n');
}

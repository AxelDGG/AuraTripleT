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
    example: '{"type":"chart","chartType":"bar|line|pie|doughnut","title":"...","labels":["..."],"datasets":[{"label":"...","data":[123,456]}]}',
    hint: 'gráficas (usa pie/doughnut para categorías, bar/line para comparaciones y tendencias).',
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
    hint: 'barras de progreso (uso de crédito, metas).',
  },
  {
    type: 'text',
    example: '{"type":"text","markdown":"..."}',
    hint: 'texto libre breve.',
  },
];

export const COMPONENT_TYPES = COMPONENT_CATALOG.map((c) => c.type);

// Bloque que se inserta tal cual en el prompt del agente.
export function componentsPromptSection() {
  return [
    'COMPONENTES DE UI DISPONIBLES (elige los que mejor comuniquen la respuesta, usualmente 2-5):',
    ...COMPONENT_CATALOG.map((c) => `- ${c.example} — ${c.hint}`),
  ].join('\n');
}

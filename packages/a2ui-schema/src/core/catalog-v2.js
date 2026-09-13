// Catálogo Norte A2UI v2: los componentes que el agente puede pedir.
//
// A2UI no entrega biblioteca de UI; cada cliente publica su propio catálogo y
// el agente solo puede componer con lo que hay en él. Este archivo es esa
// publicación: de aquí salen (1) el descriptor JSON que expone la API en
// GET /api/a2ui/catalog, (2) la sección del prompt que le explica al modelo qué
// puede armar y (3) la lista con la que web y mobile anuncian qué saben pintar.
//
// Tres capas, a propósito:
//   layout   → cómo se acomoda la pantalla (esto es lo que v1 no podía hacer)
//   domain   → las piezas bancarias propias (gráficas, KPIs, cuentas…)
//   input    → controles ligados al modelo de datos, sin volver al LLM
//   action   → botones y formularios que cierran el ciclo con el agente

export const A2UI_VERSION = 'v1.0';
export const CATALOG_ID = 'urn:norte:a2ui:catalog:banorte:v2';
export const ROOT_ID = 'root';

export const COMPONENT_CATALOG_V2 = [
  // ---------- layout ----------
  {
    name: 'Stack',
    kind: 'layout',
    container: true,
    example: '{"component":"Stack","gap":"md","children":[...]}',
    hint: 'apila hijos en vertical. gap: sm|md|lg.',
  },
  {
    name: 'Row',
    kind: 'layout',
    container: true,
    example: '{"component":"Row","wrap":true,"children":[...]}',
    hint: 'hijos en horizontal; con wrap se acomodan en varias líneas si no caben.',
  },
  {
    name: 'Grid',
    kind: 'layout',
    container: true,
    example: '{"component":"Grid","columns":3,"children":[...]}',
    hint: 'rejilla de 2 a 4 columnas; ideal para varios Kpi o AccountCard.',
  },
  {
    name: 'Card',
    kind: 'layout',
    container: true,
    example: '{"component":"Card","title":"...","children":[...]}',
    hint: 'tarjeta con borde que agrupa hijos relacionados.',
  },
  {
    name: 'Section',
    kind: 'layout',
    container: true,
    example: '{"component":"Section","title":"...","subtitle":"...","children":[...]}',
    hint: 'bloque con título de sección y sus hijos debajo.',
  },
  {
    name: 'Tabs',
    kind: 'layout',
    container: true,
    example: '{"component":"Tabs","items":[{"label":"12 meses","children":[...]},{"label":"24 meses","children":[...]}]}',
    hint: 'pestañas; cada item tiene label y sus propios hijos. Úsalo para comparar escenarios.',
  },
  {
    name: 'Divider',
    kind: 'layout',
    container: false,
    example: '{"component":"Divider"}',
    hint: 'línea separadora.',
  },
  {
    name: 'List',
    kind: 'layout',
    container: true,
    example: '{"component":"List","items":{"path":"/movimientos"},"template":{"component":"Text","markdown":{"path":"description"}}}',
    hint: 'repite template por cada elemento de items (una lista del dataModel); dentro del template las rutas sin "/" son relativas al elemento.',
  },

  // ---------- domain ----------
  {
    name: 'Header',
    kind: 'domain',
    container: false,
    example: '{"component":"Header","title":"...","subtitle":"...","badge":"..."}',
    hint: 'encabezado de la vista.',
  },
  {
    name: 'Kpi',
    kind: 'domain',
    container: false,
    example: '{"component":"Kpi","label":"...","value":"$48,250.75","delta":"+12%","trend":"up|down|neutral","icon":"💰"}',
    hint: 'una métrica clave; pon varias dentro de un Grid. value puede ser un binding con call currency.',
  },
  {
    name: 'AccountCard',
    kind: 'domain',
    container: false,
    example: '{"component":"AccountCard","name":"...","number":"**** 4821","balance":48250.75,"currency":"MXN","kind":"checking|savings|credit","extra":"..."}',
    hint: 'tarjeta de una cuenta; varias van en un Grid o Row.',
  },
  {
    name: 'Chart',
    kind: 'domain',
    container: false,
    example: '{"component":"Chart","chartType":"<ver catálogo de gráficas>","title":"...","labels":["..."],"datasets":[{"label":"...","data":[123,456]}]}',
    hint: 'gráfica; labels y data pueden ser bindings (path o call) y se redibuja sola cuando cambia el dataModel.',
  },
  {
    name: 'Table',
    kind: 'domain',
    container: false,
    example: '{"component":"Table","title":"...","columns":["..."],"rows":[["..."]]}',
    hint: 'datos tabulares.',
  },
  {
    name: 'TransactionList',
    kind: 'domain',
    container: false,
    example: '{"component":"TransactionList","title":"...","items":[{"date":"2026-09-01","description":"...","category":"...","amount":-299.0}]}',
    hint: 'movimientos; items puede ser un binding a una lista del dataModel.',
  },
  {
    name: 'DataTable',
    kind: 'domain',
    container: false,
    example: '{"component":"DataTable","title":"Pagos programados","columns":[{"key":"date","label":"Fecha","format":"date"},{"key":"amount","label":"Monto","format":"currency","align":"right"},{"key":"status","label":"Estado","format":"badge"}],"rows":{"path":"/pagos"},"pageSize":8}',
    hint: 'tabla con filas como objetos (no arreglos), columnas ordenables y formato por columna. Úsala en vez de Table cuando haya varias filas comparables o estados.',
  },
  {
    name: 'Calendar',
    kind: 'domain',
    container: false,
    example: '{"component":"Calendar","title":"Septiembre","month":"2026-09","events":{"path":"/agenda"},"selected":{"path":"/schedule/date"}}',
    hint: 'calendario mensual con marcas por día. events: [{date:"2026-09-15",label,kind payment|personal|due}]. Si le pones "value":{"path"} los días se vuelven seleccionables y escriben la fecha ahí.',
  },
  {
    name: 'Alert',
    kind: 'domain',
    container: false,
    example: '{"component":"Alert","level":"info|success|warning|error","title":"...","text":"..."}',
    hint: 'avisos y confirmaciones.',
  },
  {
    name: 'Progress',
    kind: 'domain',
    container: false,
    example: '{"component":"Progress","label":"...","value":65,"caption":"..."}',
    hint: 'barra de avance 0-100.',
  },
  {
    name: 'Text',
    kind: 'domain',
    container: false,
    example: '{"component":"Text","markdown":"..."}',
    hint: 'texto breve con **negritas** y `código`.',
  },

  // ---------- input ----------
  {
    name: 'Slider',
    kind: 'input',
    container: false,
    example: '{"component":"Slider","label":"Plazo","value":{"path":"/plan/months"},"min":6,"max":36,"step":6,"unit":"meses"}',
    hint: 'control deslizante; value DEBE ser {"path"}: al moverlo se escribe ahí y todo lo que dependa de esa ruta se recalcula al instante, sin llamarte.',
  },
  {
    name: 'Select',
    kind: 'input',
    container: false,
    example: '{"component":"Select","label":"Cuenta","value":{"path":"/form/fromAccountId"},"options":[{"value":"ACC-001","label":"Nómina"}]}',
    hint: 'lista desplegable ligada a una ruta.',
  },
  {
    name: 'ChoiceChips',
    kind: 'input',
    container: false,
    example: '{"component":"ChoiceChips","label":"Escenario","value":{"path":"/plan/months"},"options":[{"value":12,"label":"12 meses"},{"value":24,"label":"24 meses"}]}',
    hint: 'opciones como chips (una activa); mejor que Select cuando son 2-5 opciones.',
  },
  {
    name: 'TextField',
    kind: 'input',
    container: false,
    example: '{"component":"TextField","label":"Monto","value":{"path":"/form/amount"},"inputType":"number","placeholder":"0.00"}',
    hint: 'campo de texto o número ligado a una ruta.',
  },
  {
    name: 'Toggle',
    kind: 'input',
    container: false,
    example: '{"component":"Toggle","label":"Incluir seguro","value":{"path":"/plan/insurance"}}',
    hint: 'interruptor booleano ligado a una ruta.',
  },
  {
    name: 'DatePicker',
    kind: 'input',
    container: false,
    example: '{"component":"DatePicker","label":"Fecha del recordatorio","value":{"path":"/schedule/date"},"min":"2026-09-12","hint":"..."}',
    hint: 'selector de fecha: botón con la fecha elegida que abre un calendario. value DEBE ser {"path"} y se escribe como "YYYY-MM-DD". min/max acotan el rango.',
  },

  // ---------- action ----------
  {
    name: 'Button',
    kind: 'action',
    container: false,
    example: '{"component":"Button","label":"Aplicar plan","variant":"primary|secondary|ghost","action":{"event":{"name":"confirm_restructure","context":{"months":{"path":"/plan/months"}}}}}',
    hint: 'dispara un evento hacia ti con el contexto resuelto del dataModel. Con "confirm": true el cliente pide confirmar antes de enviar.',
  },
  {
    name: 'Form',
    kind: 'action',
    container: false,
    example: '{"component":"Form","title":"...","description":"...","submitLabel":"...","action":"transfer_funds","fields":[{"name":"...","label":"...","inputType":"text|number|select","options":[{"value":"...","label":"..."}],"placeholder":"...","value":"..."}]}',
    hint: 'formulario clásico: al enviarse te llega el evento con nombre = action y los campos como contexto.',
  },
];

export const COMPONENT_NAMES_V2 = COMPONENT_CATALOG_V2.map((c) => c.name);
export const CONTAINER_COMPONENTS = new Set(COMPONENT_CATALOG_V2.filter((c) => c.container).map((c) => c.name));
// Componente interno del cliente para el esqueleto que se pinta mientras el
// agente trabaja. No se le ofrece al modelo.
export const INTERNAL_COMPONENTS = ['Skeleton'];

// Sinónimos frecuentes del modelo (y nombres del catálogo básico de A2UI).
const ALIASES = {
  column: 'Stack', container: 'Stack', vstack: 'Stack', box: 'Card', hstack: 'Row',
  metric: 'Kpi', kpi_card: 'Kpi', stat: 'Kpi',
  account: 'AccountCard', balance_card: 'AccountCard',
  transactions: 'TransactionList', movements: 'TransactionList',
  input: 'TextField', textinput: 'TextField', textfield: 'TextField',
  dropdown: 'Select', choicepicker: 'Select', picker: 'Select',
  range: 'Slider', switch: 'Toggle', checkbox: 'Toggle', chips: 'ChoiceChips', segmented: 'ChoiceChips',
  paragraph: 'Text', markdown: 'Text', label: 'Text',
  datatable: 'DataTable', data_grid: 'DataTable', grid_table: 'DataTable',
  calendar_view: 'Calendar', month_calendar: 'Calendar', agenda: 'Calendar',
  datefield: 'DatePicker', dateinput: 'DatePicker', date: 'DatePicker', daypicker: 'DatePicker',
  heading: 'Header', title: 'Header',
  notice: 'Alert', banner: 'Alert',
  progressbar: 'Progress',
  separator: 'Divider',
  tab: 'Tabs',
  skeleton: 'Skeleton',
};

const LOWER_NAMES = new Map([...COMPONENT_NAMES_V2, ...INTERNAL_COMPONENTS].map((n) => [n.toLowerCase(), n]));

// 'kpi' → 'Kpi', 'Column' → 'Stack', 'hologram' → null.
export function canonicalComponentName(name) {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (LOWER_NAMES.has(key)) return LOWER_NAMES.get(key);
  if (LOWER_NAMES.has(key.replace(/_/g, ''))) return LOWER_NAMES.get(key.replace(/_/g, ''));
  return ALIASES[key] ?? ALIASES[key.replace(/_/g, '')] ?? null;
}

export function isComponentName(name) {
  return canonicalComponentName(name) !== null;
}

// Descriptor público del catálogo (lo que un cliente anuncia y la API expone).
export function catalogDescriptor({ functions = [] } = {}) {
  return {
    catalogId: CATALOG_ID,
    version: A2UI_VERSION,
    components: COMPONENT_CATALOG_V2.map(({ name, kind, container, hint }) => ({ name, kind, container, hint })),
    functions,
  };
}

// Firmas de las renderer functions para el prompt. Se documentan aquí (y no en
// functions.js) porque esto es lo que el modelo lee; la implementación es aparte.
export const FUNCTION_GUIDE = [
  'currency({v}) compact({v}) percent({v}) number({v,decimals,unit}) date({v}) template({text:"Pagas {p}",p}) concat({parts})',
  'add/sub/mul/div({a,b}) sum({values}|{items,key}) pct({part,total}) round({v,decimals}) avg/min/max({values}) pluck({items,key}) lookup({items,key,value,field}) count({items}) eq/gt/lt({a,b}) if({cond,then,else})',
  'amortize({amount,months,annualRate})=mensualidad totalInterest({…}) totalPayment({…}) schedule({amount,months,annualRate,field:"balance|interest|capital"})=serie por mes scheduleLabels({months}) effectiveAnnual({annualRate})=CAT aprox',
];

// Firma compacta de cada componente para el prompt. El presupuesto de tokens
// del orquestador es chico (Groq on-demand: 8k tokens por minuto, contando
// tools y resultados), así que el prompt describe el catálogo como firmas y
// no con un JSON de ejemplo por componente; un solo ejemplo completo al final
// enseña la forma.
const SIGNATURES = {
  Stack: 'Stack{gap sm|md|lg,children}',
  Row: 'Row{wrap,children}',
  Grid: 'Grid{columns 2-4,children}',
  Card: 'Card{title,children}',
  Section: 'Section{title,subtitle,children}',
  Tabs: 'Tabs{items:[{label,children}]} (comparar escenarios)',
  Divider: 'Divider',
  List: 'List{items:{path},template:{componente}} (en template las rutas sin "/" son relativas al elemento)',
  Header: 'Header{title,subtitle,badge}',
  Kpi: 'Kpi{label,value,delta,trend up|down|neutral,icon}',
  AccountCard: 'AccountCard{name,number,balance,kind checking|savings|credit,extra}',
  Chart: 'Chart{chartType,title,subtitle,caption,labels,datasets:[{label,data,kind,axis,color}],format,unit,target,targetLabel,value,max,label}',
  Table: 'Table{title,columns,rows}',
  TransactionList: 'TransactionList{title,items:[{date,description,category,amount}]}',
  DataTable: 'DataTable{title,columns:[{key,label,format text|currency|date|number|percent|badge,align}],rows (objetos con esas key),pageSize,emptyText} (ordenable al hacer clic en el encabezado)',
  Calendar: 'Calendar{title,month "YYYY-MM",events:[{date,label,kind payment|personal|due}],selected,value} (con value:{path} los días se seleccionan)',
  Alert: 'Alert{level info|success|warning|error,title,text}',
  Progress: 'Progress{label,value 0-100,caption}',
  Text: 'Text{markdown}',
  Slider: 'Slider{label,value,min,max,step,unit}',
  Select: 'Select{label,value,options:[{value,label}]}',
  ChoiceChips: 'ChoiceChips{label,value,options:[{value,label}]} (2-5 opciones)',
  TextField: 'TextField{label,value,inputType text|number,placeholder}',
  Toggle: 'Toggle{label,value}',
  DatePicker: 'DatePicker{label,value,min,max,hint} (value se escribe como "YYYY-MM-DD")',
  Button: 'Button{label,variant primary|secondary|ghost,confirm,action:{event:{name,context}}}',
  Form: 'Form{title,description,action,submitLabel,fields:[{name,label,inputType text|number|select,options,placeholder,value}]} (al enviarse llega el evento "action" con los campos)',
};

const EXAMPLE =
  '{"component":"Section","title":"Tu plan","children":[{"component":"Grid","columns":2,"children":[{"component":"Kpi","label":"Pago mensual","value":{"call":"currency","args":{"v":{"call":"amortize","args":{"amount":{"path":"/plan/balance"},"months":{"path":"/plan/months"},"annualRate":{"path":"/plan/annualRate"}}}}}},{"component":"Kpi","label":"Plazo","value":{"call":"template","args":{"text":"{m} meses","m":{"path":"/plan/months"}}}}]},{"component":"Slider","label":"Plazo","value":{"path":"/plan/months"},"min":6,"max":36,"step":6,"unit":"meses"},{"component":"Button","label":"Aplicar plan","action":{"event":{"name":"confirm_restructure","context":{"months":{"path":"/plan/months"}}}}}]}';

// Bloque del prompt: catálogo + reglas de binding. `only` restringe a lo que el
// cliente anunció que sabe pintar (negociación de capacidades).
export function componentsPromptSectionV2({ only } = {}) {
  const allowed = only && only.length ? new Set(only.map(canonicalComponentName).filter(Boolean)) : null;
  const entries = COMPONENT_CATALOG_V2.filter((c) => !allowed || allowed.has(c.name));
  const byKind = (kind) => entries.filter((c) => c.kind === kind).map((c) => SIGNATURES[c.name] ?? c.name).join(' · ');
  return [
    'COMPONENTES A2UI ("ui" es un árbol: los contenedores llevan "children"; usa 3-8 componentes bien acomodados):',
    `Layout: ${byKind('layout')}`,
    `Dominio: ${byKind('domain')}`,
    `Controles (su "value" DEBE ser {"path":...}): ${byKind('input')}`,
    `Acciones: ${byKind('action')}`,
    'Bindings: un valor puede ser literal, {"path":"/ruta"} (JSON Pointer al dataModel) o {"call":"fn","args":{...}} (derivado; los args aceptan bindings). Lo que un control pueda cambiar vive en dataModel; lo derivado se describe con call y el cliente lo recalcula al instante sin llamarte. {"path":"/lista/*/campo"} recorre una lista. Un Button manda su event con el context resuelto y te llega como [action:name].',
    `Funciones: ${FUNCTION_GUIDE.join(' · ')}`,
    `Ejemplo: ${EXAMPLE}`,
  ].join('\n');
}

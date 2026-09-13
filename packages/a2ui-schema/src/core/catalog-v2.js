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
//
// Cada entrada tiene exactamente dos descripciones, cada una con su destino:
//   signature → lo ÚNICO que lee el modelo (firma compacta: el presupuesto del
//               orquestador es de 8k tokens por minuto contando tools)
//   hint      → lo que un cliente lee del descriptor HTTP
// No hay una tercera: un ejemplo por componente se desincronizaba de la firma.

export const A2UI_VERSION = 'v1.0';
export const CATALOG_ID = 'urn:norte:a2ui:catalog:banorte:v2';
export const ROOT_ID = 'root';

export const COMPONENT_CATALOG_V2 = [
  // ---------- layout ----------
  {
    name: 'Stack',
    kind: 'layout',
    container: true,
    signature: 'Stack{gap sm|md|lg,children}',
    hint: 'apila hijos en vertical. gap: sm|md|lg.',
  },
  {
    name: 'Row',
    kind: 'layout',
    container: true,
    signature: 'Row{wrap,children}',
    hint: 'hijos en horizontal; con wrap se acomodan en varias líneas si no caben.',
  },
  {
    name: 'Grid',
    kind: 'layout',
    container: true,
    signature: 'Grid{columns 2-4,children}',
    hint: 'rejilla de 2 a 4 columnas; ideal para varios Kpi o AccountCard.',
  },
  {
    name: 'Card',
    kind: 'layout',
    container: true,
    signature: 'Card{title,children}',
    hint: 'tarjeta con borde que agrupa hijos relacionados.',
  },
  {
    name: 'Section',
    kind: 'layout',
    container: true,
    signature: 'Section{title,subtitle,children}',
    hint: 'bloque con título de sección y sus hijos debajo.',
  },
  {
    name: 'Tabs',
    kind: 'layout',
    container: true,
    signature: 'Tabs{items:[{label,children}]} (comparar escenarios)',
    hint: 'pestañas; cada item tiene label y sus propios hijos. Úsalo para comparar escenarios.',
  },
  {
    name: 'Divider',
    kind: 'layout',
    container: false,
    signature: 'Divider',
    hint: 'línea separadora.',
  },
  {
    name: 'List',
    kind: 'layout',
    container: true,
    signature: 'List{items:{path},template:{componente}} (en template las rutas sin "/" son relativas al elemento)',
    hint: 'repite template por cada elemento de items (una lista del dataModel); dentro del template las rutas sin "/" son relativas al elemento.',
  },

  // ---------- domain ----------
  {
    name: 'Header',
    kind: 'domain',
    container: false,
    signature: 'Header{title,subtitle,badge}',
    hint: 'encabezado de la vista.',
  },
  {
    name: 'Kpi',
    kind: 'domain',
    container: false,
    signature: 'Kpi{label,value,delta,trend up|down|neutral,icon}',
    hint: 'una métrica clave; pon varias dentro de un Grid. value puede ser un binding con call currency.',
  },
  {
    name: 'AccountCard',
    kind: 'domain',
    container: false,
    signature: 'AccountCard{name,number,balance,kind checking|savings|credit,extra}',
    hint: 'tarjeta de una cuenta; varias van en un Grid o Row.',
  },
  {
    name: 'Chart',
    kind: 'domain',
    container: false,
    signature: 'Chart{chartType,title,subtitle,caption,labels,datasets:[{label,data,kind,axis,color}],format,unit,target,targetLabel,value,max,label}',
    hint: 'gráfica; labels y data pueden ser bindings (path o call) y se redibuja sola cuando cambia el dataModel.',
  },
  {
    name: 'Table',
    kind: 'domain',
    container: false,
    signature: 'Table{title,columns,rows}',
    hint: 'datos tabulares con filas como arreglos.',
  },
  {
    name: 'TransactionList',
    kind: 'domain',
    container: false,
    signature: 'TransactionList{title,items:[{date,description,category,amount}]}',
    hint: 'movimientos; items puede ser un binding a una lista del dataModel.',
  },
  {
    name: 'DataTable',
    kind: 'domain',
    container: false,
    signature: 'DataTable{title,columns:[{key,label,format text|currency|date|number|percent|badge,align}],rows (objetos con esas key),pageSize,emptyText} (ordenable al tocar el encabezado)',
    hint: 'tabla con filas como objetos (no arreglos), columnas ordenables y formato por columna. Úsala en vez de Table cuando haya varias filas comparables o estados.',
  },
  {
    name: 'Calendar',
    kind: 'domain',
    container: false,
    signature: 'Calendar{title,month "YYYY-MM",events:[{date,label,kind payment|personal|due}],selected,value} (con value:{path} los días se seleccionan)',
    hint: 'calendario mensual con marcas por día. events: [{date,label,kind payment|personal|due}]. Si le pones "value":{"path"} los días se vuelven seleccionables y escriben la fecha ahí.',
  },
  {
    name: 'Alert',
    kind: 'domain',
    container: false,
    signature: 'Alert{level info|success|warning|error,title,text}',
    hint: 'avisos y confirmaciones.',
  },
  {
    name: 'Progress',
    kind: 'domain',
    container: false,
    signature: 'Progress{label,value 0-100,caption}',
    hint: 'barra de avance 0-100.',
  },
  {
    name: 'Text',
    kind: 'domain',
    container: false,
    signature: 'Text{markdown}',
    hint: 'texto breve con **negritas** y `código`.',
  },

  // ---------- input ----------
  {
    name: 'Slider',
    kind: 'input',
    container: false,
    signature: 'Slider{label,value,min,max,step,unit}',
    hint: 'control deslizante; al moverlo escribe en su ruta y todo lo que dependa de ella se recalcula al instante, sin volver al agente.',
  },
  {
    name: 'Select',
    kind: 'input',
    container: false,
    signature: 'Select{label,value,options:[{value,label}]}',
    hint: 'lista desplegable ligada a una ruta.',
  },
  {
    name: 'ChoiceChips',
    kind: 'input',
    container: false,
    signature: 'ChoiceChips{label,value,options:[{value,label}]} (2-5 opciones)',
    hint: 'opciones como chips (una activa); mejor que Select cuando son 2-5 opciones.',
  },
  {
    name: 'TextField',
    kind: 'input',
    container: false,
    signature: 'TextField{label,value,inputType text|number,placeholder}',
    hint: 'campo de texto o número ligado a una ruta.',
  },
  {
    name: 'Toggle',
    kind: 'input',
    container: false,
    signature: 'Toggle{label,value}',
    hint: 'interruptor booleano ligado a una ruta.',
  },
  {
    name: 'DatePicker',
    kind: 'input',
    container: false,
    signature: 'DatePicker{label,value,min,max,hint} (value se escribe como "YYYY-MM-DD")',
    hint: 'selector de fecha: botón con la fecha elegida que abre un calendario. min/max acotan el rango.',
  },

  // ---------- action ----------
  {
    name: 'Button',
    kind: 'action',
    container: false,
    signature: 'Button{label,variant primary|secondary|ghost,confirm,action:{event:{name,context}}}',
    hint: 'dispara un evento hacia el agente con el contexto resuelto del dataModel. Con "confirm": true el cliente pide confirmar antes de enviar.',
  },
  {
    name: 'Form',
    kind: 'action',
    container: false,
    signature: 'Form{title,description,action,submitLabel,fields:[{name,label,inputType text|number|select,options,placeholder,value}]} (al enviarse llega el evento "action" con los campos)',
    hint: 'formulario clásico: al enviarse llega el evento con nombre = action y los campos como contexto.',
  },
];

export const COMPONENT_NAMES_V2 = COMPONENT_CATALOG_V2.map((c) => c.name);
export const CONTAINER_COMPONENTS = new Set(COMPONENT_CATALOG_V2.filter((c) => c.container).map((c) => c.name));
// Controles: su "value" tiene que ser {"path"} para que escriban en el modelo.
export const INPUT_COMPONENTS = new Set(COMPONENT_CATALOG_V2.filter((c) => c.kind === 'input').map((c) => c.name));
// Componente interno del cliente para el esqueleto que se pinta mientras el
// agente trabaja. No se le ofrece al modelo, pero todo cliente lo sabe pintar.
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

// Lo que un cliente anunció que sabe pintar, en nombres canónicos y con los
// componentes internos incluidos. `null` = sin negociación: todo el catálogo.
export function supportedSet(names) {
  if (!Array.isArray(names) || !names.length) return null;
  const set = new Set(INTERNAL_COMPONENTS);
  for (const name of names) {
    const canonical = canonicalComponentName(name);
    if (canonical) set.add(canonical);
  }
  return set.size > INTERNAL_COMPONENTS.length ? set : null;
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
// functions.js) porque esto es lo que el modelo lee; la implementación es aparte
// y un test verifica que lo documentado siga existiendo.
export const FUNCTION_GUIDE = [
  'currency({v}) compact({v}) percent({v}) number({v,decimals,unit}) date({v}) template({text:"Pagas {p}",p}) concat({parts})',
  'add/sub/mul/div({a,b}) sum({values}|{items,key}) pct({part,total}) round({v,decimals}) avg/min/max({values}) pluck({items,key}) lookup({items,key,value,field}) count({items}) eq/gt/lt({a,b}) if({cond,then,else}) coalesce({values})=primer valor no vacío',
  'amortize({amount,months,annualRate})=mensualidad totalInterest({…}) totalPayment({…}) interestSavings({amount,months,annualRate,baselineMonths,baselineRate})=intereses ahorrados vs el plan actual schedule({amount,months,annualRate,field:"balance|interest|capital"})=serie por mes scheduleLabels({months}) effectiveAnnual({annualRate})=CAT aprox',
];

// Un ejemplo completo enseña la forma mejor que veinte firmas. Si el cliente no
// sabe pintar algo de este ejemplo (negociación de capacidades), se usa uno
// mínimo con lo que sí anunció: nunca se le enseña lo que no puede usar.
const EXAMPLE = {
  needs: ['Section', 'Grid', 'Kpi', 'Slider', 'Button'],
  json:
    '{"component":"Section","title":"Tu plan","children":[{"component":"Grid","columns":2,"children":[{"component":"Kpi","label":"Pago mensual","value":{"call":"currency","args":{"v":{"call":"amortize","args":{"amount":{"path":"/plan/balance"},"months":{"path":"/plan/months"},"annualRate":{"path":"/plan/annualRate"}}}}}},{"component":"Kpi","label":"Plazo","value":{"call":"template","args":{"text":"{m} meses","m":{"path":"/plan/months"}}}}]},{"component":"Slider","label":"Plazo","value":{"path":"/plan/months"},"min":6,"max":36,"step":6,"unit":"meses"},{"component":"Button","label":"Aplicar plan","action":{"event":{"name":"confirm_restructure","context":{"months":{"path":"/plan/months"}}}}}]}',
};

const FALLBACK_EXAMPLE =
  '{"component":"Stack","children":[{"component":"Text","markdown":"**Saldo disponible**"},{"component":"Text","markdown":{"call":"currency","args":{"v":{"path":"/cuenta/saldo"}}}}]}';

const KIND_TITLES = [
  ['layout', 'Layout'],
  ['domain', 'Dominio'],
  ['input', 'Controles (su "value" DEBE ser {"path":...})'],
  ['action', 'Acciones'],
];

// Bloque del prompt: catálogo + reglas de binding. `only` restringe a lo que el
// cliente anunció que sabe pintar (negociación de capacidades).
export function componentsPromptSectionV2({ only } = {}) {
  const allowed = supportedSet(only);
  const entries = COMPONENT_CATALOG_V2.filter((c) => !allowed || allowed.has(c.name));
  const example = !allowed || EXAMPLE.needs.every((n) => allowed.has(n)) ? EXAMPLE.json : FALLBACK_EXAMPLE;
  const lines = ['COMPONENTES A2UI ("ui" es un árbol: los contenedores llevan "children"; usa 3-8 componentes bien acomodados):'];
  for (const [kind, title] of KIND_TITLES) {
    const section = entries.filter((c) => c.kind === kind).map((c) => c.signature).join(' · ');
    if (section) lines.push(`${title}: ${section}`);
  }
  lines.push(
    'Bindings: un valor puede ser literal, {"path":"/ruta"} (JSON Pointer al dataModel) o {"call":"fn","args":{...}} (derivado; los args aceptan bindings); ambos aceptan "default" para cuando la ruta venga vacía. Lo que un control pueda cambiar vive en dataModel; lo derivado se describe con call y el cliente lo recalcula al instante sin llamarte. {"path":"/lista/*/campo"} recorre una lista. Un Button manda su event con el context resuelto y te llega como [action:name].',
    `Funciones: ${FUNCTION_GUIDE.join(' · ')}`,
    `Ejemplo: ${example}`,
  );
  return lines.join('\n');
}

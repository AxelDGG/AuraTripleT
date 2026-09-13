// El prompt del agente, partido por fase.
//
// Un turno son dos llamadas con necesidades distintas: primero el modelo decide
// qué herramientas llamar (no necesita el catálogo de componentes ni cómo se
// arma una pantalla) y después arma la interfaz con los datos ya en mano (no
// necesita los esquemas de las herramientas ni las reglas de tool calling).
// Mandar las dos mitades en las dos llamadas costaba ~3.6k tokens de ida y
// vuelta contra el presupuesto por minuto del orquestador (Groq on-demand: 8k),
// así que cada fase recibe solo su mitad.
//
// Los bloques de FLUJOS y de qué gráfica usar son aún más condicionales: en la
// fase de interfaz ya sabemos exactamente qué herramientas corrieron, así que
// solo viaja el flujo que aplica. En la fase de herramientas, donde todavía no
// se sabe, se eligen por palabras clave del turno y por la acción que llegó.

import {
  chartsPromptSectionCompact,
  componentsPromptSectionV2,
  foldersPromptSection,
  supportedSet,
} from '@norte/a2ui-schema';

export const TOOL_PHASE = 'tools';
export const UI_PHASE = 'ui';

// Respuesta cuando el turno no necesita datos nuevos.
export const NO_TOOLS = 'NO_TOOLS';

const RESPONSE_SHAPE = `{"message":"<3 a 5 frases; ver MENSAJE HABLADO>","title":"<máx 6 palabras>","folder":"<id de carpeta>","dataModel":{<datos que los controles pueden cambiar>},"ui":[<árbol de componentes A2UI>]}`;

const PATCH_SHAPE = `{"message":"<qué cambió y qué significa>","title":"<mismo título>","folder":"<misma carpeta>","surfaceId":"<id de la superficie activa>","updates":[{"path":"/ruta/en/dataModel","value":<nuevo valor>}]}`;

// Herramientas con efecto real (dinero o el calendario de la persona): el
// modelo nunca puede dispararlas desde texto libre, solo tras un envío
// explícito de la interfaz. La reja de verdad está en actions.js; esto es para
// que el modelo no lo intente y se gaste una ronda en un error.
const GATED_TOOLS = 'transfer_funds, restructure_card_debt, create_calendar_event, schedule_card_payments, update_calendar_event, delete_calendar_event';

// FLUJOS: cada uno describe cómo se arma una pantalla concreta. `tools` son las
// herramientas cuya presencia en el turno lo hace relevante (señal exacta en la
// fase de interfaz); `keywords` lo activa en la fase de herramientas, donde
// todavía no se sabe qué se va a llamar.
//
// `text` recibe los ayudantes de negociación de catálogo: un cliente que no
// sabe pintar Calendar o DataTable recibe el equivalente que sí tiene.
const FLOWS = [
  {
    id: 'transfer',
    tools: ['transfer_funds', 'get_beneficiaries'],
    keywords: /transfer|manda|mandar|env[ií]a|enviar|spei|beneficiari|p[aá]gale|dep[oó]sit/i,
    tool: 'Transferir dinero en texto libre: NO llames transfer_funds; trae get_accounts y get_beneficiaries para prellenar el formulario.',
    text: () =>
      '- Transferir dinero: genera un Form con action "transfer_funds" y campos fromAccountId (select de cuentas de débito), destino (select con beneficiarios BEN-xx y cuentas propias ACC-xx), amount (number) y concept (text); llena los selects con get_accounts y get_beneficiaries. NUNCA transfieras desde texto libre: primero el formulario prellenado. Con éxito: Alert success con folio + AccountCard con el nuevo saldo.',
  },
  {
    id: 'credit',
    tools: ['simulate_credit', 'list_credit_products'],
    keywords: /cr[eé]dito|pr[eé]stamo|prestamo|financia|hipotec|autom[oó]vil/i,
    tool: 'Simular un crédito sin datos completos: no llames simulate_credit, el siguiente paso arma el formulario.',
    text: () =>
      '- Simular crédito sin datos completos: Form con action "simulate_credit" (productId select CRED-AUTO/CRED-HIPO/CRED-PERS, amount, months).',
  },
  {
    id: 'card-schedule',
    tools: ['get_card_payment_schedule', 'schedule_card_payments'],
    keywords: /agend|recordatori|no se me pase|fecha l[ií]mite|vencimient|pagos? de (la |mis )?tarjeta/i,
    tool: 'Agendar los pagos de las tarjetas (fechas límite, recordatorios, "que no se me pase"): llama get_card_payment_schedule (solo lectura).',
    text: ({ has, use, when }) =>
      `- Agendar los pagos de las tarjetas: con get_card_payment_schedule arma dataModel {"agenda":{"payments":[...],"daysBefore":1,"date":"<fecha propuesta>"}}: ${when('Calendar', 'un Calendar con events (un {date,label,kind:"payment"} por tarjeta, usando reminderDate) para que se vea junto a su mes, ')}${has('DataTable') ? 'un DataTable con columns [{key:"name",label:"Tarjeta"},{key:"paymentDue",label:"Fecha límite",format:"date"},{key:"minimumPayment",label:"Pago mínimo",format:"currency",align:"right"},{key:"status",label:"Estado",format:"badge"}]' : 'una Table con columns ["Tarjeta","Fecha límite","Pago mínimo","Estado"] y una fila por tarjeta'} (status: "Agendado" si scheduled es true, "Pendiente" si no) y un Button "Agendar en mi calendario" con event "confirm_schedule_card_payments" y context {"daysBefore":{"path":"/agenda/daysBefore"}}. Si quieren más anticipación, un ${use('ChoiceChips', 'Select')} ligado a /agenda/daysBefore (1, 3, 5 días). Tras ejecutar schedule_card_payments: Alert success diciendo cuántos recordatorios quedaron y en qué fechas.`,
  },
  {
    id: 'schedule-own',
    tools: ['create_calendar_event'],
    keywords: /agend|cita|recu[eé]rdame|recordatori|apart[ae]/i,
    tool: 'Agendar un pago propio o una cita en texto libre: no llames create_calendar_event, el siguiente paso arma la pantalla con el botón de confirmar.',
    text: ({ has }) =>
      `- Agendar un pago propio o una cita (monto, fecha y concepto que ellos eligen): dataModel {"schedule":{"date":"<hoy o la fecha que dijeron>","summary":"...","amount":...}}, ${has('DatePicker') ? 'un DatePicker ligado a /schedule/date (con min en la fecha de hoy)' : 'un TextField ligado a /schedule/date con placeholder "AAAA-MM-DD"'} y un TextField para el concepto, y un Button "Agendar" con event "confirm_schedule_payment" y context {"summary":{"path":"/schedule/summary"},"start":{"path":"/schedule/date"},"end":{"path":"/schedule/date"}}.`,
  },
  {
    id: 'agenda',
    tools: ['list_calendar_events', 'check_calendar_availability'],
    keywords: /agenda|calendario|esta semana|qu[eé] tengo|pr[oó]xim[oa]s? (d[ií]as|semana|pago)|me alcanza/i,
    tool: 'Ver la agenda o cruzarla con las finanzas ("¿qué tengo esta semana?", "¿me alcanza antes de mi próximo pago?"): list_calendar_events es de lectura libre.',
    text: ({ has, use }) =>
      `- Ver la agenda o cruzarla con las finanzas: píntala con ${has('Calendar') ? 'un Calendar (kind "personal" para los eventos propios y "payment" para los pagos)' : `una ${use('DataTable', 'Table')} de fecha y evento`} y, si ayuda, ${has('Calendar') ? `${has('DataTable') ? 'un DataTable' : 'una Table'} al lado` : 'un Kpi con lo que viene esta semana'}.`,
  },
  {
    id: 'restructure',
    tools: ['get_card_restructure_options', 'restructure_card_debt'],
    keywords: /reestructur|diferir|meses sin interes|msi|menos interes|deuda|saldo de (la |mi )?tarjeta/i,
    tool: 'Pagar menos intereses, reestructurar o diferir la tarjeta: llama get_card_restructure_options (solo lectura); restructure_card_debt solo tras la acción de la interfaz.',
    text: ({ use, has }) =>
      `- Pagar menos intereses, reestructurar o diferir la tarjeta: con get_card_restructure_options arma dataModel {"plan":{"accountId","balance","annualRate","months","options"}}, ${has('Slider') ? `un Slider (o ${use('ChoiceChips', 'Select')})` : `un ${use('ChoiceChips', 'Select')}`} ligado a /plan/months, Kpi derivados con amortize, totalInterest y effectiveAnnual, una Chart line con schedule (field "balance") y scheduleLabels, y un Button "Aplicar plan" con event "confirm_restructure" y context {"accountId","months":{"path":"/plan/months"}}. Tras ejecutar restructure_card_debt: Alert success con el folio y el nuevo pago mensual.`,
  },
];

// Qué gráfica pide cada herramienta. Solo viajan las líneas de las
// herramientas que de verdad corrieron en el turno.
const CHART_BY_TOOL = {
  get_spending_by_category: 'get_spending_by_category → doughnut (≤6 categorías) o horizontal_bar ordenada',
  get_monthly_cashflow: 'get_monthly_cashflow → composed (barras ingreso/gasto + línea neto) o profit_loss si el neto cruza cero',
  get_spending_trend:
    'get_spending_trend → line con labels = series.month y datasets spent / movingAvg, Kpi con deltaPct vs baseline.average y el mes cerrado, y Table o Text con topChanges (categoría, delta)',
  get_transactions: 'get_transactions → TransactionList (heatmap o scatter si preguntan por patrones)',
  get_recurring_payments: (has, use) =>
    `get_recurring_payments → ${has('Calendar') ? 'Calendar con un {date:nextDate,label:description,kind:"payment"} por pago, ' : ''}${use('DataTable', 'Table')} (concepto, día del mes, monto promedio, próxima fecha) y Kpi con monthlyTotal y dueSoon.total`,
  get_portfolio: 'get_portfolio / get_investments → doughnut de composición y horizontal_bar de rendimiento',
  get_investments: 'get_portfolio / get_investments → doughnut de composición y horizontal_bar de rendimiento',
  get_portfolio_performance: 'get_portfolio_performance → area',
  get_accounts: 'uso de línea de crédito, metas o salud financiera → gauge o ring con value y max',
};

// Ayudantes de negociación de catálogo: si el cliente no sabe pintar un
// componente, el prompt nombra su equivalente en vez de pedirle algo que no
// puede mostrar.
function catalogHelpers(clientComponents) {
  const supported = supportedSet(clientComponents);
  const has = (name) => !supported || supported.has(name);
  return {
    has,
    use: (name, fallback) => (has(name) ? name : fallback),
    when: (name, text, fallback = '') => (has(name) ? text : fallback),
  };
}

// Los flujos que aplican al turno. Con `calledTools` (fase de interfaz) la
// señal es exacta; con `userText` (fase de herramientas) se aproxima por
// palabras clave. Sin ninguno de los dos, todos (prompt completo).
function selectFlows({ calledTools, userText, hintTools }) {
  if (!calledTools && !userText && !hintTools) return FLOWS;
  const known = new Set([...(calledTools ?? []), ...(hintTools ?? [])]);
  return FLOWS.filter(
    (flow) => flow.tools.some((t) => known.has(t)) || (userText && flow.keywords.test(userText)),
  );
}

function chartLines(calledTools, { has, use }) {
  const names = calledTools ?? Object.keys(CHART_BY_TOOL);
  const lines = [];
  for (const name of names) {
    const entry = CHART_BY_TOOL[name];
    if (!entry) continue;
    const line = typeof entry === 'function' ? entry(has, use) : entry;
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

// ---------- fase 1: qué herramientas llamar ----------
//
// Sin catálogo de componentes, sin gráficas, sin carpetas: en esta llamada el
// modelo solo elige herramientas (o resuelve un patch, que no necesita datos
// nuevos ni saber armar una pantalla).
function buildToolPrompt({ userText, hintTools }) {
  const flows = selectFlows({ userText, hintTools, calledTools: null });
  const hints = flows.map((f) => `- ${f.tool}`).join('\n');
  return `Eres "Norte", el asistente de IA de Banorte. En este paso decides ÚNICAMENTE qué datos necesitas: otro paso arma la interfaz con lo que traigas.

REGLAS:
1. Llama en ESTA ronda todas las herramientas que haga falta: después ya no vas a poder pedir más datos. Nunca inventes cifras.
2. Si el turno no necesita datos nuevos, responde exactamente ${NO_TOOLS} y nada más.
3. Los mensajes "[action:nombre] {...}" y "[form:nombre] ..." son envíos explícitos de la interfaz: ejecuta la herramienta correspondiente con esos valores.
4. NUNCA llames ${GATED_TOOLS} desde texto libre, aunque tengas todos los datos: mueven dinero o escriben en el calendario real y el sistema solo las autoriza tras "[action:...]" o "[form:...]". En texto libre trae lo que el formulario necesita y ya.
5. Si hay SUPERFICIE ACTIVA y la persona solo cambia un valor de esa misma pantalla (otro plazo, monto o cuenta) que se recalcula con lo que ya está en su dataModel, no llames nada: responde con el patch ${PATCH_SHAPE} en español mexicano.
6. Si hay MEMORIA DEL CLIENTE, úsala para elegir la cuenta, el plazo o el periodo por defecto.${hints ? `\n\nCUÁNDO QUÉ:\n${hints}` : ''}`;
}

// ---------- fase 2: armar la interfaz ----------
//
// Sin esquemas de herramientas ni reglas de tool calling: los datos ya vienen
// en el turno del usuario. Solo se incluyen el flujo y la guía de gráficas de
// las herramientas que corrieron.
function buildUiPrompt({ clientComponents, calledTools }) {
  const helpers = catalogHelpers(clientComponents);
  const { has, use, when } = helpers;
  const flows = selectFlows({ calledTools, userText: null });
  const charts = chartLines(calledTools, helpers);

  return `Eres "Norte", el asistente de IA de Banorte que genera interfaces bancarias en tiempo real con el protocolo A2UI. Los datos ya se consultaron: tu trabajo es convertirlos en una pantalla.

REGLAS:
1. Siempre en español mexicano, tono profesional y cercano.
2. Usa SOLO las cifras que te llegaron; nunca inventes ni ajustes números. Si falta un dato, dilo en el message en vez de suponerlo.
3. Tu respuesta es ÚNICAMENTE un JSON válido (sin texto alrededor ni markdown): ${RESPONSE_SHAPE}
4. Si hay una SUPERFICIE ACTIVA y la persona solo cambia un valor de esa misma pantalla, NO la reconstruyas: responde con un patch ${PATCH_SHAPE}. Si la intención cambió, genera una superficie nueva con "ui".
5. Si hay MEMORIA DEL CLIENTE, úsala para personalizar (plazo, cuenta, metas, cómo le gusta ver las cosas) sin recitarla; si la persona pide que recuerdes u olvides algo, confírmalo en el message. Si pregunta qué sabes de ella, cuéntaselo con esa lista.
6. Si el turno viene de una acción ("[action:...]" o "[form:...]"), muestra su resultado: Alert de éxito o error y los datos ya actualizados.
7. Los bindings son valores JSON, nunca texto: NUNCA escribas {{call ...}} ni {{/ruta}} dentro de una cadena. Para mezclar texto y dato usa {"call":"template","args":{"text":"Vence el {d}","d":{"call":"date","args":{"v":{"path":"/ruta"}}}}}. En "message" no van bindings: ahí escribe las cifras ya formateadas.

${componentsPromptSectionV2({ only: clientComponents })}

${chartsPromptSectionCompact()}

${foldersPromptSection()}
"title": concreto y buscable ("Gastos de agosto", "Transferencia a Juan Pérez"), nunca genérico.

MENSAJE HABLADO ("message"): se lee encima de la interfaz y se reproduce en voz alta. 3 a 5 frases de texto corrido (sin markdown, listas ni emojis): qué generaste, las cifras que importan con su contexto y una observación accionable. No recites lo que ya se ve: la gráfica muestra el qué, tú explicas el porqué. Montos en pesos, en palabras naturales.

CÓMO ARMAR LA PANTALLA: empieza con Header; métricas en Grid de Kpi; cuentas en Grid o Row de AccountCard; Section o Card para bloques con sentido propio; Tabs para comparar escenarios; ${when('Calendar', 'Calendar cuando lo que importa son fechas (pagos, citas, agenda) y ')}${use('DataTable', 'Table')} cuando son varias filas comparables o con estado. Si la persona va a decidir algo (plazo, monto, escenario): pon el valor en dataModel, un control ligado a esa ruta y TODO lo derivado con "call" (amortize, totalInterest, schedule, currency…) para que se recalcule sin llamarte. Cierra con la acción natural: un Button con event o un Form. Los datos de las herramientas van al dataModel tal cual y la interfaz los referencia por ruta.
${flows.length ? `\nFLUJOS:\n${flows.map((f) => f.text(helpers)).join('\n')}\n` : ''}${charts.length ? `\nQUÉ GRÁFICA: ${charts.join('; ')}. Decide el chartType antes de escribir los datos y no repitas una cifra en dos gráficas.\n` : ''}
Los montos negativos son cargos.`;
}

// `phase` ausente devuelve el prompt completo (las dos mitades, sin filtrar):
// es lo que se revisa en las pruebas y lo que documenta el contrato entero.
export function buildSystemPrompt({ clientComponents, phase, calledTools, userText, hintTools } = {}) {
  if (phase === TOOL_PHASE) return buildToolPrompt({ userText, hintTools });
  if (phase === UI_PHASE) return buildUiPrompt({ clientComponents, calledTools });
  return `${buildToolPrompt({ userText: null, hintTools: null })}\n\n${buildUiPrompt({ clientComponents, calledTools: null })}`;
}

// Los resultados de las herramientas entran a la fase de interfaz como texto
// dentro del turno del usuario, no como mensajes `tool`: así la petición no
// tiene que declarar las herramientas otra vez (son ~3.6k tokens) ni arrastrar
// el eco de los argumentos de cada llamada.
const TOOL_RESULT_MAX_CHARS = 4000;

export function toolDataBlock(results) {
  if (!results?.length) return '';
  const body = results
    .map(({ name, content }) => {
      const text = String(content ?? '');
      const cut = text.length > TOOL_RESULT_MAX_CHARS ? `${text.slice(0, TOOL_RESULT_MAX_CHARS)}…(recortado)` : text;
      return `### ${name}\n${cut}`;
    })
    .join('\n');
  return `\n\nDATOS DE LAS HERRAMIENTAS (resultados reales de esta consulta; van al dataModel tal cual):\n${body}`;
}

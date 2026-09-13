// Cómo viaja una superficie A2UI por el stream SSE.
//
// El reto premia que la pantalla se arme a la vista de la persona, así que la
// superficie no se manda de golpe:
//
//   1. createSurface   con un esqueleto en cuanto el modelo pide herramientas
//                      (ya sabemos qué tipo de pantalla viene: una gráfica, cuentas, movimientos…)
//   2. updateDataModel con el modelo de datos completo
//   3. updateComponents en varios envíos, de la raíz hacia abajo, con una pausa
//                      corta entre ellos para que se vea construir
//
// Un turno que solo cambia valores (un patch) manda únicamente updateDataModel.

import { ROOT_ID, makeMessage, orderFromRoot } from '@norte/a2ui-schema';

export const DEFAULT_CHUNK_SIZE = 3;
export const DEFAULT_CHUNK_DELAY_MS = Number(process.env.A2UI_STREAM_DELAY_MS ?? 110);

// Qué silueta pinta el esqueleto según la herramienta que el modelo pidió.
const TOOL_SKELETON = {
  get_spending_by_category: 'chart',
  get_spending_trend: 'chart',
  get_monthly_cashflow: 'chart',
  get_portfolio_performance: 'chart',
  get_portfolio: 'chart',
  get_investments: 'chart',
  get_watchlist: 'list',
  get_transactions: 'list',
  get_accounts: 'cards',
  get_customer_profile: 'text',
  get_beneficiaries: 'form',
  get_exchange_rates: 'kpis',
  list_credit_products: 'kpis',
  simulate_credit: 'kpis',
  transfer_funds: 'text',
  get_card_restructure_options: 'plan',
  restructure_card_debt: 'text',
  // Agenda: lo primero que aparece es la silueta de un mes.
  get_card_payment_schedule: 'calendar',
  list_calendar_events: 'calendar',
  check_calendar_availability: 'calendar',
  get_recurring_payments: 'calendar',
  schedule_card_payments: 'text',
  create_calendar_event: 'text',
  update_calendar_event: 'text',
  delete_calendar_event: 'text',
};

const MAX_SKELETON_BLOCKS = 4;

// Esqueleto: una raíz con placeholders. Siempre empieza por un encabezado.
export function skeletonSurface(surfaceId, toolNames = []) {
  const variants = ['header'];
  for (const name of toolNames) {
    const variant = TOOL_SKELETON[name] ?? 'text';
    if (!variants.includes(variant)) variants.push(variant);
    if (variants.length > MAX_SKELETON_BLOCKS) break;
  }
  const blocks = variants.map((variant, index) => ({ id: `sk_${index + 1}`, component: 'Skeleton', variant }));
  return {
    surfaceId,
    components: [{ id: ROOT_ID, component: 'Stack', children: blocks.map((b) => b.id) }, ...blocks],
    dataModel: {},
  };
}

// Parte la lista (en orden de anchura desde la raíz) en envíos de `size`.
export function chunkComponents(components, size = DEFAULT_CHUNK_SIZE) {
  const ordered = orderFromRoot(components, ROOT_ID);
  const chunks = [];
  for (let i = 0; i < ordered.length; i += size) chunks.push(ordered.slice(i, i + size));
  return chunks;
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (!ms || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

// Emite los mensajes del protocolo por el stream. `emit` recibe {type:'a2ui', message}.
export function createA2uiEmitter(emit) {
  const send = (kind, payload) => {
    const message = makeMessage(kind, payload);
    if (message) emit({ type: 'a2ui', message });
    return message;
  };
  return {
    createSurface: (payload) => send('createSurface', payload),
    updateComponents: (payload) => send('updateComponents', payload),
    updateDataModel: (payload) => send('updateDataModel', payload),
    deleteSurface: (payload) => send('deleteSurface', payload),

    // La superficie completa, por partes.
    async streamSurface(surface, { skeletonShown = false, chunkSize = DEFAULT_CHUNK_SIZE, delayMs = DEFAULT_CHUNK_DELAY_MS, signal } = {}) {
      const { surfaceId, catalogId, dataModel, components } = surface;
      if (!skeletonShown) {
        send('createSurface', { surfaceId, catalogId, dataModel, components: [] });
      } else {
        send('updateDataModel', { surfaceId, path: '', value: dataModel });
      }
      const chunks = chunkComponents(components, chunkSize);
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) return;
        if (i > 0) await sleep(delayMs, signal);
        send('updateComponents', { surfaceId, components: chunks[i] });
      }
    },

    // Patch: solo cambian valores del modelo de la superficie activa.
    streamPatch(surfaceId, updates = []) {
      for (const { path, value } of updates) send('updateDataModel', { surfaceId, path, value });
    },
  };
}

// Eventos tipados que la UI generada manda de vuelta al agente.
//
// Un Button o un Form emiten `{event: {name, context}}`. Aquí vive la lista de
// los eventos que el servidor reconoce y, sobre todo, cuáles AUTORIZAN una
// herramienta con dinero de por medio: `transfer_funds` y
// `restructure_card_debt` solo se ejecutan con `confirmed: true`, y ese valor
// lo fija este archivo, nunca el modelo.
//
// Un evento que no está en la lista no es un error: llega al agente como
// contexto (el modelo inventa nombres de acción para sus formularios), pero no
// autoriza nada.

import { z } from 'zod';

const amount = z.union([z.number(), z.string()]).pipe(z.coerce.number().positive());
const id = z.string().min(1).max(40);

const TransferContext = z
  .object({
    fromAccountId: id,
    amount,
    destino: id.optional(),
    toBeneficiaryId: id.optional(),
    toAccountId: id.optional(),
    concept: z.string().max(140).optional(),
  })
  .passthrough()
  .refine((c) => c.destino || c.toBeneficiaryId || c.toAccountId, { message: 'falta el destino' });

const RestructureContext = z
  .object({
    accountId: id.optional(),
    months: z.union([z.number(), z.string()]).pipe(z.coerce.number().int().min(1).max(60)),
  })
  .passthrough();

export const ACTION_EVENTS = {
  // Transferencia SPEI: el Form v1 usa action "transfer_funds" y los Button v2
  // pueden usar "confirm_transfer"; los dos autorizan la misma herramienta.
  transfer_funds: { tool: 'transfer_funds', confirms: true, schema: TransferContext },
  confirm_transfer: { tool: 'transfer_funds', confirms: true, schema: TransferContext },
  // Reestructura de tarjeta (Fase E): el botón "Aplicar plan".
  confirm_restructure: { tool: 'restructure_card_debt', confirms: true, schema: RestructureContext },
  restructure_card_debt: { tool: 'restructure_card_debt', confirms: true, schema: RestructureContext },
  // Simulaciones: no mueven dinero, no requieren confirmación.
  simulate_credit: { tool: 'simulate_credit', confirms: false },
};

// Herramientas que reciben `confirmed` y que el modelo no puede autorizar solo.
export const CONFIRMABLE_TOOLS = new Set(Object.values(ACTION_EVENTS).filter((e) => e.confirms).map((e) => e.tool));

// Compatibilidad con el canal viejo: un mensaje "[form:transfer_funds] ..." es
// un envío explícito del formulario v1 y autoriza la transferencia.
const LEGACY_FORM_PATTERN = /^\[form:([a-zA-Z0-9_]+)\]/;

// Conjunto de herramientas que este turno autoriza (validando el contexto del
// evento contra su esquema). Vacío en un turno de texto libre.
export function authorizedTools({ userMessage = '', action = null } = {}) {
  const authorized = new Set();
  const legacy = LEGACY_FORM_PATTERN.exec(userMessage);
  if (legacy && ACTION_EVENTS[legacy[1]]?.confirms) authorized.add(ACTION_EVENTS[legacy[1]].tool);
  if (action?.event?.name) {
    const entry = ACTION_EVENTS[action.event.name];
    if (entry?.confirms) {
      const ok = entry.schema ? entry.schema.safeParse(action.event.context ?? {}).success : true;
      if (ok) authorized.add(entry.tool);
    }
  }
  return authorized;
}

// Texto con el que el evento entra a la conversación del modelo.
export function describeAction(action) {
  const name = action?.event?.name ?? 'accion';
  const context = action?.event?.context ?? {};
  return `[action:${name}] ${JSON.stringify(context)}`;
}

// Eventos tipados que la UI generada manda de vuelta al agente.
//
// Un Button o un Form emiten `{event: {name, context}}`. Aquí vive la lista de
// los eventos que el servidor reconoce y, sobre todo, cuáles AUTORIZAN una
// herramienta con un efecto real: mover dinero (`transfer_funds`,
// `restructure_card_debt`) o escribir en el calendario de la persona
// (`create_calendar_event`, `schedule_card_payments`, `update_calendar_event`,
// `delete_calendar_event`). Todas ellas solo se ejecutan con `confirmed: true`,
// y ese valor lo fija este archivo, nunca el modelo.
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

// Fecha del calendario: "2026-09-15" o un ISO 8601 con hora.
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/, 'fecha inválida');

// Pago personalizado que la persona agenda desde la interfaz (Calendar/DatePicker).
const ScheduleEventContext = z
  .object({
    summary: z.string().min(1).max(200),
    start: calendarDate,
    end: calendarDate.optional(),
    description: z.string().max(500).optional(),
    calendarId: z.string().max(120).optional(),
  })
  .passthrough();

// Agendado automático de las fechas de pago de las tarjetas.
const ScheduleCardPaymentsContext = z
  .object({
    accountId: id.optional(),
    daysBefore: z.union([z.number(), z.string()]).pipe(z.coerce.number().int().min(0).max(30)).optional(),
    calendarId: z.string().max(120).optional(),
  })
  .passthrough();

const CalendarEventRefContext = z
  .object({
    eventId: z.string().min(1).max(1024),
    calendarId: z.string().max(120).optional(),
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
  // Google Calendar: escribir en la agenda de la persona también es un efecto
  // secundario, así que pasa por la misma reja que el dinero. Leer (listar
  // eventos, ver disponibilidad, get_card_payment_schedule) no requiere nada.
  confirm_schedule_payment: { tool: 'create_calendar_event', confirms: true, schema: ScheduleEventContext },
  create_calendar_event: { tool: 'create_calendar_event', confirms: true, schema: ScheduleEventContext },
  confirm_schedule_card_payments: { tool: 'schedule_card_payments', confirms: true, schema: ScheduleCardPaymentsContext },
  schedule_card_payments: { tool: 'schedule_card_payments', confirms: true, schema: ScheduleCardPaymentsContext },
  confirm_reschedule_payment: { tool: 'update_calendar_event', confirms: true, schema: CalendarEventRefContext },
  confirm_cancel_payment: { tool: 'delete_calendar_event', confirms: true, schema: CalendarEventRefContext },
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

// Herramienta que le toca ejecutar a un evento de la interfaz. El agente la usa
// como señal exacta para elegir qué flujo del prompt mandar en la fase de
// herramientas, donde todavía no sabe qué se va a llamar.
export function toolForAction(action) {
  return ACTION_EVENTS[action?.event?.name ?? '']?.tool ?? null;
}

// Texto con el que el evento entra a la conversación del modelo.
export function describeAction(action) {
  const name = action?.event?.name ?? 'accion';
  const context = action?.event?.context ?? {};
  return `[action:${name}] ${JSON.stringify(context)}`;
}

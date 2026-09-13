// Herramientas de Google Calendar expuestas vía MCP: agendar y consultar
// citas (p.ej. con un asesor Banorte) desde el mismo agente que ya usa las
// tools bancarias. Requiere GOOGLE_CLIENT_ID/SECRET y haber corrido
// `npm run google:auth` una vez para generar el token con refresh_token.

import { getAuthorizedClient, isGoogleConfigured } from './google/auth.js';

const DEFAULT_CALENDAR_ID = 'primary';
const DEFAULT_TIME_ZONE = 'America/Mexico_City';
const NOT_CONFIGURED_ERROR = {
  error:
    'Google Calendar no está configurado. Define GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET en el .env y corre "npm run google:auth" una vez para autorizar el acceso.',
};
// Escribir en el calendario real de la persona es un efecto secundario: igual
// que una transferencia, solo se ejecuta cuando el servidor lo autoriza tras un
// botón o formulario de la interfaz (apps/api/src/actions.js). El modelo nunca
// fija `confirmed` por su cuenta.
const NOT_CONFIRMED_ERROR = {
  error:
    'Esta acción escribe en el calendario y requiere confirmación explícita de la persona. Genera primero la interfaz con la fecha propuesta y un Button que la confirme; no la ejecutes desde texto libre.',
};

async function calendarClient() {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  // googleapis solo se instala si se usa Google Calendar: se importa on-demand
  // para que el servidor bancario arranque aunque el paquete no esté presente.
  const { google } = await import('googleapis');
  return google.calendar({ version: 'v3', auth });
}

// `boundary` distingue el inicio del fin porque en los eventos de todo el día
// Google trata end.date como exclusivo: un evento de un solo día se pide como
// start 2026-09-15 / end 2026-09-16. Quien llama manda la misma fecha en ambos
// (que es lo natural) y aquí se corrige.
function toEventTime(value, timeZone, boundary = 'start') {
  if (!value) return undefined;
  // Fecha sin hora (YYYY-MM-DD) = evento de todo el día; si trae hora, es dateTime.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { dateTime: value, timeZone };
  return { date: boundary === 'end' ? shiftIsoDate(value, 1) : value };
}

// Días entre dos fechas aplicados sobre una fecha ISO "YYYY-MM-DD" sin pasar
// por UTC (new Date("2026-09-15") se corre un día en México).
function shiftIsoDate(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createCalendarTools({ bankingTools } = {}) {
  async function listEvents({ calendarId, timeMin, timeMax, query, maxResults } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    const { data } = await calendar.events.list({
      calendarId: calendarId || DEFAULT_CALENDAR_ID,
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || undefined,
      q: query || undefined,
      maxResults: maxResults || 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return {
      events: (data.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary,
        description: e.description ?? null,
        location: e.location ?? null,
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        htmlLink: e.htmlLink,
      })),
    };
  }

  async function createEvent({
    calendarId,
    summary,
    description,
    location,
    start,
    end,
    timeZone,
    attendees,
    confirmed,
  } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (confirmed !== true) return NOT_CONFIRMED_ERROR;
    if (!summary) return { error: 'summary es requerido.' };
    if (!start || !end) return { error: 'start y end son requeridos (ISO 8601, ej. 2026-03-05T10:00:00-06:00).' };
    const tz = timeZone || DEFAULT_TIME_ZONE;
    const { data } = await calendar.events.insert({
      calendarId: calendarId || DEFAULT_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        location,
        start: toEventTime(start, tz, 'start'),
        end: toEventTime(end, tz, 'end'),
        attendees: attendees?.map((email) => ({ email })),
      },
    });
    return { success: true, id: data.id, htmlLink: data.htmlLink, summary: data.summary };
  }

  async function updateEvent({
    calendarId,
    eventId,
    summary,
    description,
    location,
    start,
    end,
    timeZone,
    confirmed,
  } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (confirmed !== true) return NOT_CONFIRMED_ERROR;
    if (!eventId) return { error: 'eventId es requerido.' };
    const tz = timeZone || DEFAULT_TIME_ZONE;
    const requestBody = {
      ...(summary !== undefined && { summary }),
      ...(description !== undefined && { description }),
      ...(location !== undefined && { location }),
      ...(start !== undefined && { start: toEventTime(start, tz, 'start') }),
      ...(end !== undefined && { end: toEventTime(end, tz, 'end') }),
    };
    const { data } = await calendar.events.patch({
      calendarId: calendarId || DEFAULT_CALENDAR_ID,
      eventId,
      requestBody,
    });
    return { success: true, id: data.id, htmlLink: data.htmlLink, summary: data.summary };
  }

async function deleteEvent({ calendarId, eventId, confirmed } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (confirmed !== true) return NOT_CONFIRMED_ERROR;
    if (!eventId) return { error: 'eventId es requerido.' };
    await calendar.events.delete({ calendarId: calendarId || DEFAULT_CALENDAR_ID, eventId });
    return { success: true, id: eventId };
  }

  async function checkAvailability({ timeMin, timeMax, calendarId } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (!timeMin || !timeMax) return { error: 'timeMin y timeMax son requeridos (ISO 8601).' };
    const id = calendarId || DEFAULT_CALENDAR_ID;
    const { data } = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id }] },
    });
    const busy = data.calendars?.[id]?.busy ?? [];
    return { calendarId: id, busy, available: busy.length === 0 };
  }

  // ---------- pagos de tarjeta en el calendario ----------

  const reminderTitle = (account) => `Pago ${account.name}`;

  // Lo que ya está agendado para una tarjeta, para no duplicar el recordatorio
  // y para que la interfaz pueda mostrar el estado real de cada fecha.
  async function findReminder(calendar, calendarId, account) {
    const due = account.paymentDue;
    if (!due) return null;
    const { data } = await calendar.events.list({
      calendarId,
      q: reminderTitle(account),
      timeMin: new Date(`${shiftIsoDate(due, -31)}T00:00:00Z`).toISOString(),
      timeMax: new Date(`${shiftIsoDate(due, 31)}T00:00:00Z`).toISOString(),
      singleEvents: true,
      maxResults: 10,
    });
    const found = (data.items ?? []).find((e) => (e.summary ?? '').includes(reminderTitle(account)));
    return found ? { eventId: found.id, date: found.start?.date ?? found.start?.dateTime, htmlLink: found.htmlLink } : null;
  }

  // Read-only: las próximas fechas de pago y si ya están en el calendario.
  // Es lo que alimenta el Calendar y el DataTable de la interfaz.
  async function getCardPaymentSchedule({ calendarId, daysBefore } = {}) {
    if (!bankingTools) return { error: 'Las herramientas bancarias no están disponibles en este servidor.' };
    const offset = Number.isFinite(Number(daysBefore)) ? Number(daysBefore) : 1;
    const cards = (await bankingTools.getAccounts()).filter((a) => a.type === 'credit' && a.paymentDue);
    const calendar = calendarClient();
    const id = calendarId || DEFAULT_CALENDAR_ID;
    const payments = [];
    for (const card of cards) {
      const reminder = calendar ? await findReminder(calendar, id, card) : null;
      payments.push({
        accountId: card.id,
        name: card.name,
        number: card.number,
        paymentDue: card.paymentDue,
        reminderDate: shiftIsoDate(card.paymentDue, -offset),
        minimumPayment: card.minimumPayment ?? null,
        noInterestPayment: card.noInterestPayment ?? null,
        scheduled: Boolean(reminder),
        eventId: reminder?.eventId ?? null,
        htmlLink: reminder?.htmlLink ?? null,
      });
    }
    return { daysBefore: offset, calendarConnected: Boolean(calendar), payments };
  }

  // Escritura confirmable: agenda (o repara) el recordatorio de cada tarjeta.
  // Es idempotente: si el evento ya existe para esa tarjeta no lo duplica.
  async function scheduleCardPayments({ calendarId, accountId, daysBefore, confirmed } = {}) {
    const calendar = calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (confirmed !== true) return NOT_CONFIRMED_ERROR;
    if (!bankingTools) return { error: 'Las herramientas bancarias no están disponibles en este servidor.' };
    const offset = Number.isFinite(Number(daysBefore)) ? Number(daysBefore) : 1;
    const id = calendarId || DEFAULT_CALENDAR_ID;
    const cards = (await bankingTools.getAccounts()).filter(
      (a) => a.type === 'credit' && a.paymentDue && (!accountId || a.id === accountId),
    );
    if (!cards.length) return { error: 'No encontré tarjetas con fecha de pago para agendar.' };

    const scheduled = [];
    for (const card of cards) {
      const date = shiftIsoDate(card.paymentDue, -offset);
      const existing = await findReminder(calendar, id, card);
      // Mismo recordatorio, misma fecha: no hay nada que hacer.
      if (existing && existing.date === date) {
        scheduled.push({ accountId: card.id, name: card.name, date: existing.date, eventId: existing.eventId, htmlLink: existing.htmlLink, alreadyScheduled: true });
        continue;
      }
      // Ya hay recordatorio pero con otra anticipación (cambiaron de 1 a 3 o 5
      // días): se mueve el evento en vez de ignorar la elección o duplicarlo.
      if (existing) {
        const { data } = await calendar.events.patch({
          calendarId: id,
          eventId: existing.eventId,
          requestBody: { start: { date }, end: { date: shiftIsoDate(date, 1) } },
        });
        scheduled.push({ accountId: card.id, name: card.name, date, eventId: data.id, htmlLink: data.htmlLink, moved: true, previousDate: existing.date });
        continue;
      }
      const minimum = card.minimumPayment ? `Pago mínimo: $${card.minimumPayment.toLocaleString('es-MX')}. ` : '';
      const noInterest = card.noInterestPayment ? `Para no generar intereses: $${card.noInterestPayment.toLocaleString('es-MX')}. ` : '';
      const { data } = await calendar.events.insert({
        calendarId: id,
        requestBody: {
          summary: reminderTitle(card),
          description: `${minimum}${noInterest}Fecha límite de pago: ${card.paymentDue}. Agendado por Norte AI.`,
          // En eventos de todo el día, end.date es exclusivo: el día siguiente.
          start: { date },
          end: { date: shiftIsoDate(date, 1) },
        },
      });
      scheduled.push({ accountId: card.id, name: card.name, date, eventId: data.id, htmlLink: data.htmlLink, alreadyScheduled: false });
    }
    return {
      success: true,
      daysBefore: offset,
      created: scheduled.filter((s) => !s.alreadyScheduled && !s.moved).length,
      moved: scheduled.filter((s) => s.moved).length,
      scheduled,
    };
  }

  return {
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    checkAvailability,
    getCardPaymentSchedule,
    scheduleCardPayments,
    isConfigured: isGoogleConfigured,
  };
}

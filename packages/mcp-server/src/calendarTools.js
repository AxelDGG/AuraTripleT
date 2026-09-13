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

async function calendarClient() {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  // googleapis solo se instala si se usa Google Calendar: se importa on-demand
  // para que el servidor bancario arranque aunque el paquete no esté presente.
  const { google } = await import('googleapis');
  return google.calendar({ version: 'v3', auth });
}

function toEventTime(value, timeZone) {
  if (!value) return undefined;
  // Fecha sin hora (YYYY-MM-DD) = evento de todo el día; si trae hora, es dateTime.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { date: value } : { dateTime: value, timeZone };
}

export function createCalendarTools() {
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
  } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (!summary) return { error: 'summary es requerido.' };
    if (!start || !end) return { error: 'start y end son requeridos (ISO 8601, ej. 2026-03-05T10:00:00-06:00).' };
    const tz = timeZone || DEFAULT_TIME_ZONE;
    const { data } = await calendar.events.insert({
      calendarId: calendarId || DEFAULT_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        location,
        start: toEventTime(start, tz),
        end: toEventTime(end, tz),
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
  } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
    if (!eventId) return { error: 'eventId es requerido.' };
    const tz = timeZone || DEFAULT_TIME_ZONE;
    const requestBody = {
      ...(summary !== undefined && { summary }),
      ...(description !== undefined && { description }),
      ...(location !== undefined && { location }),
      ...(start !== undefined && { start: toEventTime(start, tz) }),
      ...(end !== undefined && { end: toEventTime(end, tz) }),
    };
    const { data } = await calendar.events.patch({
      calendarId: calendarId || DEFAULT_CALENDAR_ID,
      eventId,
      requestBody,
    });
    return { success: true, id: data.id, htmlLink: data.htmlLink, summary: data.summary };
  }

  async function deleteEvent({ calendarId, eventId } = {}) {
    const calendar = await calendarClient();
    if (!calendar) return NOT_CONFIGURED_ERROR;
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

  return { listEvents, createEvent, updateEvent, deleteEvent, checkAvailability, isConfigured: isGoogleConfigured };
}

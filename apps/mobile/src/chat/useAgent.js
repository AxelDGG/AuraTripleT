// Conversación con el agente.
//
// Mantiene el estado de un turno completo: qué está pensando, qué herramientas
// MCP llamó, qué superficie construyó y qué se archivó en el historial. Es el
// equivalente de apps/web/public/js/agent.js, con los mismos eventos SSE:
//   status · tool_call · tool_result · a2ui · ui · history · error · done
//
// Norte A2UI v2: los mensajes del protocolo (evento `a2ui`) se aplican al store
// compartido y el renderer nativo (src/a2ui/A2UIRenderer) pinta cada cambio.
// La pantalla empieza a existir con el esqueleto y se completa por partes. Los
// botones y formularios de la UI generada salen por `sendAction` como eventos
// tipados, y la superficie activa viaja en cada petición para que el agente
// pueda responder con un patch en vez de reconstruirla.
//
// El historial de la conversación se recorta a los últimos turnos: el agente
// necesita contexto, pero mandarle todo hace la petición cara y lenta.

import { useCallback, useRef, useState } from 'react';
import { streamAction, streamChat } from '../api/endpoints';
import { clientCapabilities, surfaceStore } from '../a2ui/A2UIRenderer';

const HISTORY_TURNS = 12;

// Nombres legibles de las herramientas MCP, para que la persona vea de dónde
// salieron sus datos en vez de un identificador de código.
const TOOL_LABELS = {
  get_customer_profile: 'Consultando tu perfil',
  get_accounts: 'Leyendo tus cuentas',
  get_transactions: 'Revisando tus movimientos',
  get_spending_by_category: 'Analizando tus gastos',
  get_monthly_cashflow: 'Calculando tu flujo mensual',
  get_beneficiaries: 'Buscando tus beneficiarios',
  transfer_funds: 'Ejecutando la transferencia',
  simulate_credit: 'Simulando el crédito',
  list_credit_products: 'Consultando productos de crédito',
  get_investments: 'Revisando tus inversiones',
  get_portfolio: 'Leyendo tu portafolio',
  get_portfolio_performance: 'Calculando rendimientos',
  get_watchlist: 'Consultando el mercado',
  get_exchange_rates: 'Consultando el tipo de cambio',
  get_card_restructure_options: 'Calculando opciones de reestructura',
  restructure_card_debt: 'Aplicando tu plan de pago',
};

export const toolLabel = (name) => TOOL_LABELS[name] ?? `Consultando ${String(name ?? '').replace(/_/g, ' ')}`;

const actionLabel = (name) => `Acción: ${String(name ?? '').replace(/_/g, ' ')}`;

export function useAgent({ onArchived, onMessage } = {}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [tools, setTools] = useState([]);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);

  const historyRef = useRef([]);
  const abortRef = useRef(null);
  // Superficie que la persona tiene en pantalla: {surfaceId, title}.
  const activeRef = useRef(null);

  const reset = useCallback(() => {
    setView(null);
    setError(null);
    setTools([]);
    setStatus(null);
    historyRef.current = [];
    activeRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStatus(null);
  }, []);

  const requestContext = () => {
    const active = activeRef.current;
    const surface = active && surfaceStore.get(active.surfaceId);
    return {
      history: historyRef.current.slice(-HISTORY_TURNS * 2),
      surface: surface ? { surfaceId: active.surfaceId, title: active.title, dataModel: surface.dataModel } : null,
      client: clientCapabilities(),
    };
  };

  // Un turno completo: texto libre o acción tipada.
  const runTurn = useCallback(
    async ({ message, action, liveTitle }) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setTools([]);
      setStatus('Interpretando lo que necesitas…');

      const controller = new AbortController();
      abortRef.current = controller;

      const context = requestContext();
      // El mensaje entra al historial antes de mandarlo para que, si el turno
      // falla, la conversación siga teniendo sentido.
      const userTurn = action ? `[action:${action.event.name}] ${JSON.stringify(action.event.context ?? {})}` : message;
      historyRef.current = [...historyRef.current, { role: 'user', content: userTurn }];

      let produced = null;
      let surfaceShown = false;
      const startedAt = new Date().toISOString();

      const onEvent = (event) => {
        switch (event.type) {
          case 'status':
            setStatus(event.text ?? null);
            break;
          case 'tool_call':
            setTools((current) => [...current, { name: event.name, done: false }]);
            break;
          case 'tool_result':
            setTools((current) =>
              current.map((tool) => (tool.name === event.name && !tool.done ? { ...tool, done: true } : tool)),
            );
            break;
          case 'a2ui': {
            const applied = surfaceStore.apply(event.message);
            const created = event.message?.createSurface;
            const deleted = event.message?.deleteSurface;
            if (created && applied) {
              // Primera superficie del turno: la pantalla empieza a construirse.
              surfaceShown = true;
              activeRef.current = { surfaceId: created.surfaceId, title: liveTitle };
              setView({ surfaceId: created.surfaceId, title: liveTitle, folder: null, message: null, ui: [], prompt: userTurn, createdAt: startedAt, building: true });
            } else if (deleted && activeRef.current?.surfaceId === deleted.surfaceId) {
              surfaceShown = false;
            }
            break;
          }
          case 'ui':
            produced = event;
            if (event.patch) {
              // La superficie activa ya recibió los updateDataModel; solo cambia el mensaje.
              setView((current) => (current ? { ...current, message: event.message ?? current.message, building: false } : current));
            } else if (event.surface?.surfaceId) {
              if (!surfaceStore.has(event.surface.surfaceId)) surfaceStore.apply({ version: 'v1.0', createSurface: event.surface });
              activeRef.current = { surfaceId: event.surface.surfaceId, title: event.title ?? '' };
              setView({
                surfaceId: event.surface.surfaceId,
                title: event.title ?? null,
                folder: event.folder ?? null,
                message: event.message ?? null,
                ui: Array.isArray(event.ui) ? event.ui : [],
                prompt: userTurn,
                createdAt: startedAt,
                building: false,
              });
            } else {
              // Sin superficie (API vieja): se pinta la proyección v1.
              activeRef.current = null;
              setView({
                surfaceId: null,
                title: event.title ?? null,
                folder: event.folder ?? null,
                message: event.message ?? null,
                ui: Array.isArray(event.ui) ? event.ui : [],
                prompt: userTurn,
                createdAt: startedAt,
                building: false,
              });
            }
            setStatus(null);
            if (event.message) onMessage?.(event.message);
            break;
          case 'history':
            if (event.entry) onArchived?.(event.entry);
            break;
          case 'error':
            setError(event.text ?? 'El agente no pudo responder.');
            break;
          default:
            break;
        }
      };

      try {
        const request = { ...context, signal: controller.signal, onEvent };
        if (action) await streamAction({ action, ...request });
        else await streamChat({ message, ...request });

        if (produced?.message) {
          historyRef.current = [...historyRef.current, { role: 'assistant', content: produced.message }];
        }
        if (!produced && surfaceShown) setView((current) => (current ? { ...current, building: false } : current));
      } catch (err) {
        setError(err?.message ?? 'No se pudo hablar con el agente.');
      } finally {
        abortRef.current = null;
        setBusy(false);
        setStatus(null);
      }
    },
    [busy, onArchived, onMessage],
  );

  const send = useCallback(
    (rawMessage) => {
      const message = String(rawMessage ?? '').trim();
      if (!message) return Promise.resolve();
      return runTurn({ message, liveTitle: message });
    },
    [runTurn],
  );

  // Evento tipado desde la UI generada (Button o Form del renderer A2UI).
  const sendAction = useCallback(
    (payload) => {
      if (!payload?.event?.name) return Promise.resolve();
      return runTurn({ action: payload, liveTitle: actionLabel(payload.event.name) });
    },
    [runTurn],
  );

  // Mostrar una visualización archivada sin volver a llamar al agente. Si trae
  // superficie (la API eleva las entradas viejas), se vuelve la activa: la
  // siguiente pregunta puede ser un patch sobre ella.
  const showArchived = useCallback((entry) => {
    setError(null);
    setTools([]);
    const surface = entry.spec?.surface;
    if (surface?.surfaceId) {
      surfaceStore.apply({ version: 'v1.0', createSurface: surface });
      activeRef.current = { surfaceId: surface.surfaceId, title: entry.title };
    } else {
      activeRef.current = null;
    }
    setView({
      surfaceId: surface?.surfaceId ?? null,
      title: entry.title,
      folder: entry.folder,
      message: entry.message ?? entry.spec?.message ?? null,
      ui: entry.spec?.ui ?? [],
      prompt: entry.prompt ?? null,
      createdAt: entry.createdAt,
      archived: true,
    });
  }, []);

  return { busy, status, tools, view, error, send, sendAction, reset, cancel, showArchived, setError };
}

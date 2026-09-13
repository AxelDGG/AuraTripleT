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
//
// La pantalla es un hilo: cada pregunta se agrega abajo con su respuesta
// (`turns`), y `view` es la de la última. Cuando el agente responde con un
// patch sobre la superficie anterior, esa superficie baja al turno nuevo y el
// turno viejo se queda solo con su texto: la misma pantalla no puede estar dos
// veces en el hilo.

import { useCallback, useMemo, useRef, useState } from 'react';
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
  get_spending_trend: 'Comparando tu gasto mes a mes',
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
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState(null);
  const view = turns.length ? turns[turns.length - 1].view : null;
  const turnSeq = useRef(0);

  // Agrega un turno al final del hilo y devuelve su id.
  const pushTurn = (prompt, extra = {}) => {
    const id = `t${++turnSeq.current}`;
    setTurns((current) => [...current, { id, prompt, view: null, ...extra }]);
    return id;
  };

  // Cambia la vista de un turno concreto (por id), sin tocar el resto.
  const setTurnView = (id, next) => {
    setTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, view: typeof next === 'function' ? next(turn.view) : next } : turn)),
    );
  };

  // La superficie pasa del turno que la tenía al turno nuevo.
  const moveSurface = (surfaceId, toId) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id !== toId && turn.view?.surfaceId === surfaceId
          ? { ...turn, view: { ...turn.view, surfaceId: null, movedBelow: true } }
          : turn,
      ),
    );
  };

  const historyRef = useRef([]);
  const abortRef = useRef(null);
  // Espejo de `busy` para los callbacks: el estado de React puede ir un render
  // atrás cuando dos envíos llegan seguidos.
  const busyRef = useRef(false);
  // Superficie que la persona tiene en pantalla: {surfaceId, title}.
  const activeRef = useRef(null);

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
    setTools([]);
    setStatus(null);
    historyRef.current = [];
    activeRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
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

  // Un turno completo: texto libre o acción tipada. Resuelve con el mensaje
  // hablado del agente (o null): el modo llamada lo lee en voz alta.
  const runTurn = useCallback(
    async ({ message, action, liveTitle }) => {
      if (busyRef.current) return null;
      busyRef.current = true;
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
      const turnId = pushTurn(liveTitle);
      const previousSurface = activeRef.current?.surfaceId ?? null;
      const setView = (next) => setTurnView(turnId, next);

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
              // La superficie activa ya recibió los updateDataModel: baja a este
              // turno con el mensaje nuevo y el turno anterior se queda sin ella.
              if (previousSurface) moveSurface(previousSurface, turnId);
              setView((current) => ({
                surfaceId: previousSurface,
                title: current?.title ?? activeRef.current?.title ?? null,
                folder: current?.folder ?? null,
                message: event.message ?? current?.message ?? null,
                ui: [],
                prompt: userTurn,
                createdAt: startedAt,
                building: false,
                patched: true,
              }));
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
          case 'memory':
            // Memoria del agente: lo que recuperó antes de responder y lo que
            // aprendió al cerrar (llega después de `ui`, así que la vista existe).
            if (event.used?.length) setStatus(`Recordando lo que sé de ti (${event.used.length})…`);
            if (event.learned?.length) setView((current) => (current ? { ...current, remembered: event.learned } : current));
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
        busyRef.current = false;
        setBusy(false);
        setStatus(null);
      }
      return produced?.message ?? null;
    },
    [onArchived, onMessage],
  );

  const send = useCallback(
    (rawMessage) => {
      const message = String(rawMessage ?? '').trim();
      if (!message) return Promise.resolve(null);
      return runTurn({ message, liveTitle: message });
    },
    [runTurn],
  );

  // Evento tipado desde la UI generada (Button o Form del renderer A2UI).
  const sendAction = useCallback(
    (payload) => {
      if (!payload?.event?.name) return Promise.resolve(null);
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
      // Si ya estaba en el hilo, no se duplica: baja al turno nuevo.
      moveSurface(surface.surfaceId, null);
    } else {
      activeRef.current = null;
    }
    const turnId = pushTurn(entry.title ?? entry.prompt ?? 'Del historial', { fromHistory: true });
    setTurnView(turnId, {
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

  // Un objeto estable por cambio de estado. Antes se devolvía uno nuevo en
  // cada render y todo lo que lo usaba como dependencia (efectos, callbacks)
  // se rehacía sin parar: así se re-aplicaba el deep link del widget en cada
  // render y la pantalla volvía sola a Chat.
  return useMemo(
    () => ({ busy, status, tools, view, turns, error, send, sendAction, reset, cancel, showArchived, setError }),
    [busy, status, tools, view, turns, error, send, sendAction, reset, cancel, showArchived],
  );
}

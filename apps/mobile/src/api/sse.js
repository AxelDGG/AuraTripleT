// Stream SSE del agente sobre XMLHttpRequest.
//
// `fetch` en React Native no expone `response.body`: el polyfill resuelve la
// promesa hasta que llega el último byte, así que con fetch la interfaz
// generada aparecería de golpe al final y perderíamos justo lo que el reto
// premia — ver al agente pensar, llamar herramientas y construir la pantalla.
// XHR sí entrega `responseText` parcial en cada `onprogress`, así que se lee
// desde ahí y se cortan los eventos por la línea en blanco del protocolo SSE.

import { apiUrl } from '../lib/config';
import { authHeaders } from './client';

const CHAT_TIMEOUT_MS = 180000;

// Stream SSE genérico: `path` y `body` los pone quien llama (chat o acción).
export function streamSse(path, body, { onEvent, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    // Cada evento es "data: {json}" seguido de una línea en blanco. Lo que
    // quede después del último \n\n es un evento a medio llegar: se deja en el
    // buffer para la siguiente vuelta.
    const drain = () => {
      const pending = xhr.responseText.slice(consumed);
      const parts = pending.split('\n\n');
      const remainder = parts.pop() ?? '';
      consumed += pending.length - remainder.length;
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          // Evento malformado: se ignora y el stream sigue.
        }
      }
    };

    xhr.open('POST', apiUrl(path));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);

    xhr.onprogress = drain;

    xhr.onload = () => {
      drain();
      if (xhr.status >= 200 && xhr.status < 300) return finish(resolve, undefined);
      let error = `HTTP ${xhr.status}`;
      try {
        error = JSON.parse(xhr.responseText).error || error;
      } catch {
        // La respuesta de error no era JSON; se usa el código.
      }
      finish(reject, new Error(error));
    };

    xhr.onerror = () => finish(reject, new Error('No se pudo conectar con el agente. Revisa la conexión.'));
    xhr.onabort = () => finish(resolve, undefined);

    signal?.addEventListener?.('abort', () => {
      try {
        xhr.abort();
      } catch {
        // Ya estaba cerrado.
      }
    });

    timer = setTimeout(() => {
      try {
        xhr.abort();
      } catch {
        // sin efecto
      }
      finish(reject, new Error('El agente tardó demasiado en responder.'));
    }, CHAT_TIMEOUT_MS);

    xhr.send(JSON.stringify(body));
  });
}

// Texto libre. `surface` es la superficie activa ({surfaceId, title, dataModel})
// para que el agente pueda responder con un patch; `client` anuncia qué
// componentes A2UI sabe pintar la app.
export function streamChat({ message, history = [], surface, client, onEvent, signal }) {
  return streamSse('/api/chat', { message, history, surface, client }, { onEvent, signal });
}

// Evento tipado de la UI generada: {surfaceId, event: {name, context}, dataModel}.
export function streamAction({ action, history = [], surface, client, onEvent, signal }) {
  return streamSse('/api/action', { ...action, history, surface, client }, { onEvent, signal });
}

// Cliente HTTP: salud del servicio, historial de visualizaciones (Tiger Data) y
// stream SSE del agente.
(function () {
  const DEFAULT_TIMEOUT_MS = 15000;
  const CHAT_TIMEOUT_MS = 180000;

  async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  const fetchHealth = () => fetchJson('/api/health', {}, 8000);

  // Historial completo o filtrado. Devuelve { source, folders[], entries[] }:
  // `folders` siempre trae las cinco carpetas con su total, aunque el filtro
  // deje fuera algunas entradas.
  function fetchHistory({ folder, search, limit } = {}) {
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (search) params.set('search', search);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return fetchJson(`/api/history${query ? `?${query}` : ''}`);
  }

  // Consume el stream SSE de /api/chat y entrega cada evento a onEvent.
  async function streamChat({ message, history, onEvent, signal }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {
            // Evento malformado: se ignora y se continúa con el stream.
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  window.API = { fetchHealth, fetchHistory, streamChat };
})();

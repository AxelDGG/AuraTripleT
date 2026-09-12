// Cliente HTTP: dashboard (MCP agregado), simulador y stream SSE del agente.
(function () {
  const DASHBOARD_TIMEOUT_MS = 20000;
  const CHAT_TIMEOUT_MS = 180000;

  async function fetchJson(url, options = {}, timeoutMs = DASHBOARD_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchDashboard() {
    const body = await fetchJson('/api/dashboard');
    return body.data;
  }

  async function fetchHealth() {
    return fetchJson('/api/health', {}, 8000);
  }

  async function simulateCredit(payload) {
    const body = await fetchJson('/api/simulate-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return body.data;
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

  window.API = { fetchDashboard, fetchHealth, simulateCredit, streamChat };
})();

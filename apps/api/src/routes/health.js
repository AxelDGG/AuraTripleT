import { Router } from 'express';
import { getMcpClient } from '../mcp-client.js';
import { getLlmProvider } from '../providers/index.js';

// Describe el proveedor LLM sin tumbar el health check si falta configuración.
function describeLlm() {
  try {
    const provider = getLlmProvider();
    return { provider: provider.name, model: provider.model, configured: true };
  } catch (err) {
    return { provider: null, model: null, configured: false, reason: String(err.message || err) };
  }
}

export const healthRouter = Router();

healthRouter.get('/api/health', async (_req, res) => {
  try {
    await getMcpClient();
    const llm = describeLlm();
    res.json({ ok: true, mcp: 'connected', model: llm.model, llm });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

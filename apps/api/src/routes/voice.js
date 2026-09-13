// Rutas de voz: STT y TTS via ElevenLabs.
// La key de ElevenLabs solo existe en este proceso; el cliente solo manda audio o texto.

import { Router } from 'express';
import express from 'express';
import { transcribe, speak } from '../services/elevenlabs.js';

export const voiceRouter = Router();

// POST /api/voice/transcribe
// Body: audio crudo (audio/webm, audio/mp4, etc.)
// Responde: { text: string }
voiceRouter.post(
  '/api/voice/transcribe',
  express.raw({ type: '*/*', limit: '10mb' }),
  async (req, res) => {
    if (!req.body?.length) return res.status(400).json({ error: 'audio requerido' });
    const mimeType = req.get('Content-Type') || 'audio/webm';
    try {
      const text = await transcribe(req.body, mimeType);
      res.json({ text });
    } catch (err) {
      const status = err.message.includes('no configurada') ? 503 : 502;
      res.status(status).json({ error: err.message });
    }
  },
);

// POST /api/voice/speak
// Body: { text: string }
// Responde: audio/mpeg en streaming
voiceRouter.post('/api/voice/speak', async (req, res) => {
  const text = req.body?.text;
  if (!text) return res.status(400).json({ error: 'text requerido' });
  try {
    const upstream = await speak(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) {
      const status = err.message.includes('no configurada') ? 503 : 502;
      res.status(status).json({ error: err.message });
    }
  }
});

// GET /api/voice/convai-token
// Devuelve el agent ID de ElevenLabs ConvAI para que el widget lo use en el cliente.
voiceRouter.get('/api/voice/convai-token', (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return res.status(503).json({ error: 'Configura ELEVENLABS_AGENT_ID en el .env del servidor' });
  res.json({ agentId });
});

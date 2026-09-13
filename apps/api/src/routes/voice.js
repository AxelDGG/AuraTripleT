// Rutas de voz: STT y TTS via ElevenLabs.
// La key de ElevenLabs solo existe en este proceso; el cliente solo manda audio o texto.

import { Router } from 'express';
import express from 'express';
import { transcribe, speak } from '../services/elevenlabs.js';

const MAX_SPEAK_CHARS = 1200;

export const voiceRouter = Router();

// POST /api/voice/transcribe
// Body: audio crudo (audio/webm, audio/mp4, etc.)
// Responde: { text: string }
//
// La app móvil sube el archivo grabado en binario con el mismo contrato: no
// hace falta multipart ni base64, el cuerpo es el audio y ya.
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

// Escribe el audio de ElevenLabs en la respuesta conforme va llegando, para que
// la voz empiece a sonar antes de que termine de generarse.
async function pipeSpeech(text, res) {
  const upstream = await speak(text);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

function speechError(err, res) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const status = err.message.includes('no configurada') ? 503 : 502;
  res.status(status).json({ error: err.message });
}

// POST /api/voice/speak — { text } → audio/mpeg en streaming. Lo usa la web.
voiceRouter.post('/api/voice/speak', async (req, res) => {
  const text = req.body?.text;
  if (!text) return res.status(400).json({ error: 'text requerido' });
  try {
    await pipeSpeech(String(text).slice(0, MAX_SPEAK_CHARS), res);
  } catch (err) {
    speechError(err, res);
  }
});

// GET /api/voice/speak?text=… — mismo audio, direccionable por URL.
//
// Existe para la app móvil: el reproductor nativo recibe una URI y la
// reproduce mientras se descarga. Con POST habría que bajar todo el mp3 a un
// archivo antes de oír la primera palabra, y la respuesta hablada del agente se
// sentiría lenta justo en la demo.
voiceRouter.get('/api/voice/speak', async (req, res) => {
  const text = req.query?.text;
  if (!text) return res.status(400).json({ error: 'text requerido' });
  try {
    await pipeSpeech(String(text).slice(0, MAX_SPEAK_CHARS), res);
  } catch (err) {
    speechError(err, res);
  }
});

// GET /api/voice/convai-token
// Devuelve el agent ID de ElevenLabs ConvAI para que el widget lo use en el cliente.
voiceRouter.get('/api/voice/convai-token', (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return res.status(503).json({ error: 'Configura ELEVENLABS_AGENT_ID en el .env del servidor' });
  res.json({ agentId });
});

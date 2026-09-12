// Servicio ElevenLabs: STT (Scribe) y TTS (streaming).
// La API key y el voice ID nunca salen del servidor.

const BASE = 'https://api.elevenlabs.io/v1';

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY no configurada');
  return k;
}

function voiceId() {
  const v = process.env.ELEVENLABS_VOICE_ID;
  if (!v) throw new Error('ELEVENLABS_VOICE_ID no configurada');
  return v;
}

export async function transcribe(audioBuffer, mimeType) {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.webm');
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'es');

  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs STT ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return data.text ?? '';
}

export async function speak(text) {
  const res = await fetch(`${BASE}/text-to-speech/${voiceId()}/stream`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail}`);
  }
  return res;
}

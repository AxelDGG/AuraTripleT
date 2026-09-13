// Voz de la app: dictar (STT) y escuchar al agente (TTS).
//
// Las dos mitades pasan por nuestra API, nunca por ElevenLabs directo: la key
// vive solo en el servidor. Si ElevenLabs no está configurado, la API responde
// 503 y aquí se degrada con un mensaje claro en vez de romper el flujo — la
// persona siempre puede escribir.
//
//   Dictar:   grabar con expo-audio → subir el archivo en binario a
//             /api/voice/transcribe → texto.
//   Escuchar: reproducir /api/voice/speak?text=… directo desde la URL, que
//             empieza a sonar mientras se descarga.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { apiUrl } from '../lib/config';

// Tope duro de grabación: si algo sale mal, la app no se queda grabando.
const MAX_RECORDING_MS = 30000;

export function useVoice() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);

  const playerRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
      playerRef.current?.remove?.();
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    try {
      playerRef.current?.pause?.();
      playerRef.current?.remove?.();
    } catch {
      // El reproductor ya estaba liberado.
    }
    playerRef.current = null;
    setSpeaking(false);
  }, []);

  // ---------- TTS ----------

  const speak = useCallback(
    (text) => {
      const clean = String(text ?? '').trim();
      if (!clean) return;
      stopSpeaking();
      try {
        const player = createAudioPlayer({ uri: apiUrl(`/api/voice/speak?text=${encodeURIComponent(clean.slice(0, 1200))}`) });
        playerRef.current = player;
        setSpeaking(true);
        player.addListener?.('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) stopSpeaking();
        });
        player.play();
      } catch {
        // Sin voz disponible la app sigue siendo perfectamente usable.
        setSpeaking(false);
      }
    },
    [stopSpeaking],
  );

  // ---------- STT ----------

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos el micrófono para escucharte. Actívalo en los ajustes del teléfono.');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      return true;
    } catch {
      setError('No pudimos iniciar la grabación.');
      setRecording(false);
      return false;
    }
  }, [recorder]);

  // Devuelve el texto transcrito, o null si no hubo nada que transcribir.
  const stopRecordingAndTranscribe = useCallback(async () => {
    clearTimeout(timeoutRef.current);
    if (!recording) return null;
    setRecording(false);

    let uri = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      setError('No pudimos cerrar la grabación.');
      return null;
    }
    if (!uri) return null;

    setTranscribing(true);
    try {
      const file = new File(uri);
      // Subida binaria nativa: el cuerpo del POST es el archivo tal cual, que es
      // justo lo que espera /api/voice/transcribe.
      const result = await file.upload(apiUrl('/api/voice/transcribe'), {
        httpMethod: 'POST',
        headers: { 'Content-Type': 'audio/m4a' },
        mimeType: 'audio/m4a',
      });

      if (result.status === 503) {
        setError('La transcripción no está configurada en el servidor.');
        return null;
      }
      if (result.status < 200 || result.status >= 300) {
        setError('No pudimos transcribir lo que dijiste. Intenta de nuevo.');
        return null;
      }

      const text = String(JSON.parse(result.body ?? '{}').text ?? '').trim();
      if (!text) {
        setError('No alcanzamos a escucharte. Intenta otra vez.');
        return null;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return text;
    } catch {
      setError('No pudimos enviar el audio. Revisa tu conexión.');
      return null;
    } finally {
      setTranscribing(false);
      // El archivo temporal ya no sirve para nada.
      try {
        new File(uri).delete();
      } catch {
        // Si no se pudo borrar, el sistema limpia la caché por su cuenta.
      }
    }
  }, [recorder, recording]);

  // Graba, corta sola al llegar al tope y entrega el texto por callback.
  const dictate = useCallback(
    async (onText) => {
      if (recording) {
        const text = await stopRecordingAndTranscribe();
        if (text) onText?.(text);
        return;
      }
      const started = await startRecording();
      if (!started) return;
      timeoutRef.current = setTimeout(async () => {
        const text = await stopRecordingAndTranscribe();
        if (text) onText?.(text);
      }, MAX_RECORDING_MS);
    },
    [recording, startRecording, stopRecordingAndTranscribe],
  );

  return {
    recording,
    transcribing,
    speaking,
    error,
    clearError: () => setError(null),
    dictate,
    startRecording,
    stopRecordingAndTranscribe,
    speak,
    stopSpeaking,
  };
}

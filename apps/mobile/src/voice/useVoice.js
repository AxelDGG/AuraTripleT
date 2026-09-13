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
//
// La grabación se cierra sola cuando la persona deja de hablar, igual que en la
// web: se mide el nivel del micrófono (metering) y tras un silencio corto se
// da por terminada la frase. Tocar el micrófono de nuevo sigue cortando a mano.
//
// Todo el estado que leen los callbacks vive también en refs. Estos callbacks
// se llaman desde timers, desde el reproductor y desde efectos que corren
// varios renders después de crearse; leer el estado de React ahí devolvía el
// valor viejo y, por ejemplo, el tope de 30 s nunca transcribía nada.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { authHeaders } from '../api/client';

// Tope duro de grabación: si algo sale mal, la app no se queda grabando.
const MAX_RECORDING_MS = 30000;
// Si nunca se detecta voz, se corta igual (y no se gasta una transcripción).
const NO_SPEECH_MS = 7000;
// Silencio continuo que da por terminada la frase.
const SILENCE_MS = 1100;
// Ventana inicial para medir el ruido ambiente.
const CALIBRATE_MS = 350;
// Cada cuánto se mide el nivel.
const TICK_MS = 80;
// El nivel llega en dB (negativo, 0 = tope). Por debajo de esto nunca es voz y
// por encima del piso ambiente más este margen sí lo es.
const MIN_VOICE_DB = -42;
const VOICE_MARGIN_DB = 9;

// Un mp3 que nunca avisa que terminó no puede dejar la llamada colgada.
const SPEAK_TIMEOUT_MS = 60000;

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export function useVoice() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);

  const recordingRef = useRef(false);
  const playerRef = useRef(null);
  const timeoutRef = useRef(null);
  const meterRef = useRef(null);
  // Resolución pendiente de `listen`: se cumple cuando la grabación se cierra,
  // venga de donde venga el corte (silencio, tope o toque).
  const listenRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
      clearInterval(meterRef.current);
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

  // Resuelve cuando termina de sonar (o cuando no pudo sonar). Así el modo
  // llamada sabe cuándo volver a escuchar.
  const speak = useCallback(
    (text) => {
      const clean = String(text ?? '').trim();
      if (!clean) return Promise.resolve();
      stopSpeaking();
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stopSpeaking();
          resolve();
        };
        const timer = setTimeout(finish, SPEAK_TIMEOUT_MS);
        try {
          const player = createAudioPlayer({
            uri: apiUrl(`/api/voice/speak?text=${encodeURIComponent(clean.slice(0, 1200))}`),
          });
          playerRef.current = player;
          setSpeaking(true);
          player.addListener?.('playbackStatusUpdate', (status) => {
            if (status?.didJustFinish) finish();
          });
          player.play();
        } catch {
          // Sin voz disponible la app sigue siendo perfectamente usable.
          finish();
        }
      });
    },
    [stopSpeaking],
  );

  // ---------- STT ----------

  const stopMeter = () => {
    clearInterval(meterRef.current);
    meterRef.current = null;
  };

  // Devuelve el texto transcrito, o null si no hubo nada que transcribir.
  // `reason` explica por qué se cortó: 'tap' | 'silence' | 'no-speech' | 'max'.
  const stopRecordingAndTranscribe = useCallback(
    async (reason = 'tap') => {
      clearTimeout(timeoutRef.current);
      stopMeter();
      if (!recordingRef.current) return null;
      recordingRef.current = false;
      setRecording(false);

      const pending = listenRef.current;
      listenRef.current = null;

      let uri = null;
      try {
        await recorder.stop();
        uri = recorder.uri;
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {
        setError('No pudimos cerrar la grabación.');
        pending?.resolve(null);
        return null;
      }

      const discard = () => {
        try {
          if (uri) new File(uri).delete();
        } catch {
          // Si no se pudo borrar, el sistema limpia la caché por su cuenta.
        }
      };

      // Nadie habló: no gastamos una llamada de STT en audio vacío.
      if (!uri || reason === 'no-speech') {
        discard();
        if (reason === 'no-speech') setError('No alcanzamos a escucharte. Intenta otra vez.');
        pending?.resolve(null);
        return null;
      }

      setTranscribing(true);
      let text = null;
      try {
        const file = new File(uri);
        // Subida binaria nativa: el cuerpo del POST es el archivo tal cual, que es
        // justo lo que espera /api/voice/transcribe. Va con el token de sesión
        // como el resto de la API: con AUTH_REQUIRED activo, sin él es un 401.
        const result = await file.upload(apiUrl('/api/voice/transcribe'), {
          httpMethod: 'POST',
          headers: authHeaders({ 'Content-Type': 'audio/m4a' }),
          mimeType: 'audio/m4a',
        });

        if (result.status === 503) {
          setError('La transcripción no está configurada en el servidor.');
        } else if (result.status === 401) {
          setError('Tu sesión expiró. Vuelve a iniciar sesión.');
        } else if (result.status < 200 || result.status >= 300) {
          setError('No pudimos transcribir lo que dijiste. Intenta de nuevo.');
        } else {
          text = String(JSON.parse(result.body ?? '{}').text ?? '').trim() || null;
          if (text) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          else setError('No alcanzamos a escucharte. Intenta otra vez.');
        }
      } catch {
        setError('No pudimos enviar el audio. Revisa tu conexión.');
      } finally {
        setTranscribing(false);
        discard();
      }
      pending?.resolve(text);
      return text;
    },
    [recorder],
  );

  // Vigila el nivel del micrófono y corta sola cuando la frase terminó.
  const watchSilence = useCallback(() => {
    stopMeter();
    const startedAt = Date.now();
    let floor = null;
    let floorSamples = 0;
    let hasSpoken = false;
    let lastVoiceAt = 0;

    meterRef.current = setInterval(() => {
      if (!recordingRef.current) {
        stopMeter();
        return;
      }
      let level = null;
      try {
        level = recorder.getStatus?.().metering;
      } catch {
        level = null;
      }
      const now = Date.now();
      const elapsed = now - startedAt;

      // Sin metering (algunos dispositivos no lo reportan) queda el tope y el toque.
      if (typeof level !== 'number' || !Number.isFinite(level)) return;

      if (elapsed < CALIBRATE_MS) {
        floor = floor === null ? level : (floor * floorSamples + level) / (floorSamples + 1);
        floorSamples += 1;
        return;
      }

      const threshold = Math.max(MIN_VOICE_DB, (floor ?? MIN_VOICE_DB) + VOICE_MARGIN_DB);
      if (level > threshold) {
        hasSpoken = true;
        lastVoiceAt = now;
      }

      if (!hasSpoken) {
        if (elapsed > NO_SPEECH_MS) stopRecordingAndTranscribe('no-speech');
      } else if (now - lastVoiceAt > SILENCE_MS) {
        stopRecordingAndTranscribe('silence');
      }
    }, TICK_MS);
  }, [recorder, stopRecordingAndTranscribe]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return true;
    setError(null);
    stopSpeaking();
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos el micrófono para escucharte. Actívalo en los ajustes del teléfono.');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => stopRecordingAndTranscribe('max'), MAX_RECORDING_MS);
      watchSilence();
      return true;
    } catch {
      setError('No pudimos iniciar la grabación.');
      recordingRef.current = false;
      setRecording(false);
      return false;
    }
  }, [recorder, stopRecordingAndTranscribe, stopSpeaking, watchSilence]);

  // Escucha una frase completa y resuelve con el texto (o null). Es la pieza
  // del modo llamada: escuchar → responder → volver a escuchar.
  const listen = useCallback(async () => {
    if (recordingRef.current) return stopRecordingAndTranscribe('tap');
    const started = await startRecording();
    if (!started) return null;
    return new Promise((resolve) => {
      listenRef.current = { resolve };
    });
  }, [startRecording, stopRecordingAndTranscribe]);

  // Toque del micrófono del composer: empieza a grabar, o corta y manda.
  const dictate = useCallback(
    async (onText) => {
      const text = await listen();
      if (text) onText?.(text);
    },
    [listen],
  );

  const cancelRecording = useCallback(async () => {
    clearTimeout(timeoutRef.current);
    stopMeter();
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    const pending = listenRef.current;
    listenRef.current = null;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) new File(uri).delete();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // Ya estaba cerrada.
    }
    pending?.resolve(null);
  }, [recorder]);

  const clearError = useCallback(() => setError(null), []);

  // Un solo objeto estable por cambio de estado: quien lo reciba puede usarlo
  // como dependencia sin que cada render lo vea distinto.
  return useMemo(
    () => ({
      recording,
      transcribing,
      speaking,
      error,
      clearError,
      dictate,
      listen,
      cancelRecording,
      startRecording,
      stopRecordingAndTranscribe,
      speak,
      stopSpeaking,
    }),
    [
      recording,
      transcribing,
      speaking,
      error,
      clearError,
      dictate,
      listen,
      cancelRecording,
      startRecording,
      stopRecordingAndTranscribe,
      speak,
      stopSpeaking,
    ],
  );
}

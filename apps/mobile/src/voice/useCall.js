// Modo llamada: hablar con el agente sin tocar la pantalla.
//
// Es el equivalente móvil de "Maya" en la web. Allá la conversación la lleva
// el widget de ElevenLabs; acá no hay SDK nativo que quepa sin otra build, así
// que la llamada se arma con las piezas que la app ya tiene, en bucle:
//
//   escuchar (corta sola por silencio) → transcribir → agente → leer en voz
//   alta la respuesta → volver a escuchar.
//
// Lo que el agente construye durante la llamada se pinta en el chat como
// siempre: al colgar, la última pantalla generada queda ahí.
//
// La llamada termina si la persona cuelga, si el agente falla o si no se
// escucha nada dos veces seguidas: una llamada que nadie atiende se corta.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

export const CALL = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
};

const MAX_SILENT_TURNS = 2;
const GREETING = 'Hola, soy tu asistente Banorte. ¿En qué te ayudo?';
const NO_ANSWER = 'Listo. ¿Algo más?';

export function useCall({ voice, agent }) {
  const [state, setState] = useState(CALL.IDLE);
  const [transcript, setTranscript] = useState({ user: null, agent: null });
  const [reason, setReason] = useState(null);

  const activeRef = useRef(false);
  const silentTurnsRef = useRef(0);
  // Últimas versiones de voz y agente: el bucle corre en una sola promesa
  // larga y no puede quedarse con las funciones del render en el que empezó.
  const voiceRef = useRef(voice);
  const agentRef = useRef(agent);
  voiceRef.current = voice;
  agentRef.current = agent;

  const active = state !== CALL.IDLE;

  const hangUp = useCallback(
    (why = 'hangup') => {
      if (!activeRef.current) return;
      activeRef.current = false;
      setReason(why);
      setState(CALL.IDLE);
      voiceRef.current.cancelRecording();
      voiceRef.current.stopSpeaking();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [],
  );

  const loop = useCallback(async () => {
    const alive = () => activeRef.current;

    setState(CALL.SPEAKING);
    setTranscript({ user: null, agent: GREETING });
    await voiceRef.current.speak(GREETING);

    while (alive()) {
      setState(CALL.LISTENING);
      const text = await voiceRef.current.listen();
      if (!alive()) return;

      if (!text) {
        silentTurnsRef.current += 1;
        if (silentTurnsRef.current >= MAX_SILENT_TURNS) {
          hangUp('silence');
          return;
        }
        continue;
      }
      silentTurnsRef.current = 0;

      setTranscript({ user: text, agent: null });
      setState(CALL.THINKING);
      const reply = await agentRef.current.send(text);
      if (!alive()) return;

      const spoken = reply || (agentRef.current.error ? null : NO_ANSWER);
      if (!spoken) {
        hangUp('error');
        return;
      }
      setTranscript((current) => ({ ...current, agent: spoken }));
      setState(CALL.SPEAKING);
      await voiceRef.current.speak(spoken);
    }
  }, [hangUp]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    silentTurnsRef.current = 0;
    setReason(null);
    setTranscript({ user: null, agent: null });
    voiceRef.current.clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    loop().catch(() => hangUp('error'));
  }, [hangUp, loop]);

  // Si se desmonta la pantalla a media llamada, no se queda grabando.
  useEffect(() => () => hangUp('hangup'), [hangUp]);

  return useMemo(
    () => ({ state, active, transcript, reason, start, hangUp }),
    [state, active, transcript, reason, start, hangUp],
  );
}

// Llamada con la agente conversacional de ElevenLabs (la misma "Maya" de la web).
//
// En la web la conversación la lleva el widget de ElevenLabs. Aquí la lleva el
// SDK nativo (@elevenlabs/react-native sobre LiveKit/WebRTC): el micrófono y la
// voz de la agente viajan por WebRTC directo a ElevenLabs, sin pasar por
// nuestra API. Lo único que la app le pide al servidor es el id del agente
// (/api/voice/convai-token), igual que hace la web, para que ese id no viva en
// el bundle.
//
// El SDK solo funciona en una build nativa que incluya LiveKit: por eso van
// los plugins `@livekit/react-native-expo-plugin` y
// `@config-plugins/react-native-webrtc` en app.config.js. Si la build no los
// trae (o el servidor no tiene ELEVENLABS_AGENT_ID), `available` queda en
// false y la pantalla cae al modo llamada local (useCall).
//
// Los hooks del SDK viven bajo <ConversationProvider>, que se monta en App.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AudioModule } from 'expo-audio';
import { useConversationControls, useConversationMode, useConversationStatus } from '@elevenlabs/react-native';
import { request } from '../api/client';
import { CALL } from './useCall';

const fetchAgentId = () => request('/api/voice/convai-token', { timeoutMs: 8000 });

export function useElevenLabsCall() {
  const controls = useConversationControls();
  const { status, message: statusMessage } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [transcript, setTranscript] = useState({ user: null, agent: null });
  const [error, setError] = useState(null);
  const [reason, setReason] = useState(null);
  const activeRef = useRef(false);

  // Sin sesión abierta el estado del SDK no importa: la pantalla de llamada no
  // está montada.
  const state = !active
    ? CALL.IDLE
    : connecting || status === 'connecting'
      ? CALL.CONNECTING
      : isSpeaking
        ? CALL.SPEAKING
        : CALL.LISTENING;

  const hangUp = useCallback(
    (why = 'hangup') => {
      if (!activeRef.current) return;
      activeRef.current = false;
      setActive(false);
      setConnecting(false);
      setReason(why);
      try {
        controls.endSession();
      } catch {
        // Ya estaba cerrada.
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [controls],
  );

  // Devuelve true si la llamada arrancó por ElevenLabs; false si no se pudo
  // (sin agente configurado, sin permiso de micrófono, sin red…) para que la
  // pantalla decida el respaldo.
  const start = useCallback(async () => {
    if (activeRef.current) return true;
    setError(null);
    setReason(null);
    setTranscript({ user: null, agent: null });

    let agentId = null;
    try {
      agentId = (await fetchAgentId())?.agentId ?? null;
    } catch (err) {
      setError(err?.message ?? 'La agente de voz no está configurada en el servidor.');
      return false;
    }
    if (!agentId) {
      setError('La agente de voz no está configurada en el servidor.');
      return false;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos el micrófono para la llamada. Actívalo en los ajustes del teléfono.');
        return false;
      }
    } catch {
      // Sin módulo de audio se intenta igual: el SDK pedirá el permiso.
    }

    activeRef.current = true;
    setActive(true);
    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      controls.startSession({
        agentId,
        connectionType: 'webrtc',
        onConnect: () => setConnecting(false),
        onDisconnect: () => {
          if (activeRef.current) hangUp('remote');
        },
        onError: (text) => {
          setError(typeof text === 'string' ? text : 'La llamada falló.');
          hangUp('error');
        },
        onMessage: ({ message, source, role }) => {
          const text = typeof message === 'string' ? message.trim() : '';
          if (!text) return;
          const who = source ?? role;
          const fromUser = who === 'user';
          setTranscript((current) => (fromUser ? { ...current, user: text } : { ...current, agent: text }));
        },
      });
      return true;
    } catch (err) {
      setError(err?.message ?? 'No se pudo iniciar la llamada.');
      hangUp('error');
      return false;
    }
  }, [controls, hangUp]);

  // Si el SDK reporta error a media llamada, se cuelga con el motivo.
  useEffect(() => {
    if (active && status === 'error') {
      setError(statusMessage ?? 'La llamada se cortó.');
      hangUp('error');
    }
  }, [active, status, statusMessage, hangUp]);

  // Al desmontar la pantalla no se queda una sesión de WebRTC abierta.
  useEffect(() => () => hangUp('hangup'), [hangUp]);

  return useMemo(
    () => ({ state, active, transcript, error, reason, start, hangUp, provider: 'elevenlabs' }),
    [state, active, transcript, error, reason, start, hangUp],
  );
}

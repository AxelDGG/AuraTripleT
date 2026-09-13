// Pantalla del asistente: Chat · Historial · Colecciones.
//
// Las tres pestañas comparten un mismo turno de conversación y un mismo
// historial, por eso viven en una sola pantalla y no en tres: abrir algo del
// historial lo muestra en Chat, y lo que el agente archiva aparece en Historial
// sin recargar nada.
//
// También es el destino de los deep links del widget:
//   norteai://chat?mode=voice → abre grabando
//   norteai://chat?mode=text  → abre con el teclado listo
//
// Y desde aquí se llama al agente (botón de teléfono del composer): la
// llamada se pinta encima del chat y lo que el agente construye durante ella
// queda en la pestaña Chat al colgar.

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedTabs } from '../components/ui';
import Composer from '../components/Composer';
import { useAgent } from '../chat/useAgent';
import { useHistory } from '../chat/useHistory';
import { useVoice } from '../voice/useVoice';
import { useCall } from '../voice/useCall';
import ChatTab from './assistant/ChatTab';
import HistoryTab from './assistant/HistoryTab';
import FoldersTab from './assistant/FoldersTab';
import CallOverlay from './assistant/CallOverlay';
import { color, space } from '../theme/tokens';

// Cuánto dura la ventana en la que dos entregas del mismo link se consideran
// el mismo toque. Los dos canales entregan con milisegundos de diferencia; una
// persona no alcanza a tocar dos veces el widget en menos de esto.
const LINK_ECHO_MS = 1500;

// La llave tiene que salir igual venga por react-navigation o por expo-linking,
// y distinguir los dos botones del widget, que comparten la marca de tiempo.
const linkKey = (params) =>
  [params?.mode, params?.prompt, params?.t].filter(Boolean).join('|') || null;

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'history', label: 'Historial' },
  { id: 'folders', label: 'Colecciones' },
];

export default function AssistantScreen({ route }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('chat');
  const [draft, setDraft] = useState('');
  const [autoFocus, setAutoFocus] = useState(false);

  const arrivedByVoice = useRef(false);
  const handledLink = useRef({ key: null, at: 0 });

  const voice = useVoice();
  const history = useHistory();

  // El agente habla solo si la persona llegó por voz: leer en voz alta algo que
  // acaba de escribir sería ruido. En llamada, la voz la lleva useCall.
  const speakIfVoice = useCallback(
    (message) => {
      if (arrivedByVoice.current) voice.speak(message);
    },
    [voice],
  );

  // Cuando el agente archiva una vista, entra al historial al instante.
  const agent = useAgent({ onArchived: history.prepend, onMessage: speakIfVoice });
  const call = useCall({ voice, agent });

  const send = useCallback(
    (text) => {
      setDraft('');
      setTab('chat');
      return agent.send(text);
    },
    [agent],
  );

  const dictateAndSend = useCallback(() => {
    arrivedByVoice.current = true;
    voice.dictate((text) => send(text));
  }, [send, voice]);

  const startCall = useCallback(() => {
    arrivedByVoice.current = false;
    setTab('chat');
    call.start();
  }, [call]);

  // --- Deep links del widget y peticiones de otras pestañas ---
  //
  // Un mismo toque llega dos veces: por los params de react-navigation y por
  // expo-linking, con milisegundos de diferencia. Eso es lo que hay que
  // descartar — y SOLO eso. Por eso la ventana es de tiempo y no de por vida,
  // y la llave incluye el modo: dos entregas del mismo toque caen dentro de la
  // ventana; dos toques de verdad, no.
  //
  // Y un link se aplica una vez por ENTREGA, nunca por render. La versión
  // anterior tenía `applyLink` como dependencia de los efectos, y como se
  // rehacía en cada render (dependía de objetos que cambiaban siempre), el
  // link del widget se volvía a aplicar con cada cambio de estado: cambiar de
  // pestaña devolvía a Chat, y con `mode=voice` la grabación se encendía y
  // apagaba sola hasta trabar la pantalla. Ahora los efectos dependen solo de
  // lo que de verdad es una entrega nueva (`params`, el evento `url`) y leen
  // la última versión de `applyLink` a través de una ref.
  const applyLink = useCallback(
    ({ mode, prompt, key }) => {
      if (!mode && !prompt) return;
      const now = Date.now();
      if (handledLink.current.key === key && now - handledLink.current.at < LINK_ECHO_MS) return;
      handledLink.current = { key, at: now };
      setTab('chat');

      // Una pregunta que llega desde otra pestaña (Cuentas, Servicios…) se
      // manda tal cual: la persona ya decidió qué quiere saber.
      if (prompt) {
        arrivedByVoice.current = false;
        send(prompt);
        return;
      }
      if (mode === 'voice') {
        arrivedByVoice.current = true;
        voice.dictate((text) => send(text));
      } else {
        setAutoFocus(true);
      }
    },
    [send, voice],
  );
  const applyLinkRef = useRef(applyLink);
  applyLinkRef.current = applyLink;

  const params = route?.params;
  useEffect(() => {
    applyLinkRef.current({
      mode: params?.mode,
      prompt: params?.prompt,
      key: linkKey(params),
    });
  }, [params]);

  // El widget puede abrir la app con la sesión bloqueada: en ese caso esta
  // pantalla se monta después del desbloqueo y react-navigation ya consumió el
  // link, así que se vuelve a leer de expo-linking para no perder la intención.
  // Solo al montar: la URL inicial no cambia en toda la vida de la app.
  useEffect(() => {
    const handle = (url) => {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      applyLinkRef.current({
        mode: queryParams?.mode,
        key: linkKey(queryParams),
      });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const subscription = Linking.addEventListener('url', (event) => handle(event.url));
    return () => subscription.remove();
  }, []);

  const openArchived = useCallback(
    (entry) => {
      agent.showArchived(entry);
      arrivedByVoice.current = false;
      setTab('chat');
    },
    [agent],
  );

  // El composer flota sobre el contenido; este relleno evita que tape la última
  // tarjeta de cualquier lista.
  const contentPadding = 96;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 56 : 0}
    >
      <View style={styles.tabsWrap}>
        <SegmentedTabs items={TABS} value={tab} onChange={setTab} />
      </View>

      <View style={styles.body}>
        {tab === 'chat' ? (
          <ChatTab agent={agent} onSend={send} contentPadding={contentPadding} />
        ) : null}
        {tab === 'history' ? (
          <HistoryTab history={history} onOpen={openArchived} contentPadding={contentPadding} />
        ) : null}
        {tab === 'folders' ? (
          <FoldersTab history={history} onOpenEntry={openArchived} contentPadding={contentPadding} />
        ) : null}
      </View>

      {tab === 'chat' ? (
        <View style={styles.composer}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSubmit={() => {
              arrivedByVoice.current = false;
              send(draft);
            }}
            onMicPress={dictateAndSend}
            onCallPress={startCall}
            recording={voice.recording}
            transcribing={voice.transcribing}
            busy={agent.busy}
            autoFocus={autoFocus}
            voiceError={voice.error}
          />
        </View>
      ) : null}

      {call.active ? <CallOverlay call={call} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface2 },
  tabsWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    backgroundColor: color.surface2,
  },
  body: { flex: 1 },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: 'rgba(244,244,247,0.96)',
  },
});

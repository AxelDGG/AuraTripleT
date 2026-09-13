// Pestaña Chat: el centro de la app.
//
// Los tres pasos del reto se ven aquí en orden: se interpreta la intención
// (estado "pensando"), se consultan datos por MCP (cada herramienta aparece
// conforme se llama) y se construye la interfaz (Norte UI Spec renderizado con
// componentes nativos). Lo que la persona toca en esa interfaz —un formulario—
// vuelve al agente y genera la siguiente pantalla.
//
// Es un hilo: cada pregunta nueva se agrega abajo, separada de la anterior por
// una línea gris clara, y la lista se desplaza sola hasta lo último. Lo de
// arriba no desaparece: se puede subir a comparar con lo que ya se preguntó.

import { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, EmptyState, ErrorBanner, ScrollFade, Text } from '../../components/ui';
import Icon from '../../components/Icon';
import NorteRenderer from '../../renderer/NorteRenderer';
import A2UIRenderer from '../../a2ui/A2UIRenderer';
import { toolLabel } from '../../chat/useAgent';
import { color, radius, space } from '../../theme/tokens';
import { fmtRelative } from '../../lib/format';

// Los glifos son los del set propio (components/Icon): el mismo trazo que el
// resto de la app, sin emojis que cada teléfono pinta a su manera.
const SUGGESTIONS = [
  { icon: 'card', label: 'Pagar menos intereses', prompt: 'Quiero pagar menos intereses de mi tarjeta: muéstrame cómo quedaría mi saldo a meses fijos y déjame elegir el plazo.' },
  { icon: 'wallet', label: 'Saldo de mi cuenta', prompt: '¿Cuánto tengo en mis cuentas?' },
  { icon: 'transfers', label: 'Últimas Transferencias', prompt: 'Muéstrame mis últimas transferencias' },
  { icon: 'chartLine', label: 'Resumen de Gastos', prompt: '¿En qué se me fue el dinero este mes?' },
];

function Welcome({ onPick, disabled }) {
  return (
    <View style={styles.welcome}>
      <Image source={require('../../../assets/brand/Banorte_Header_Red.png')} style={styles.welcomeLogo} resizeMode="contain" />
      <Text variant="h1" style={styles.welcomeTitle}>
        ¿Qué quieres ver hoy?
      </Text>
      <Text variant="small" style={styles.welcomeText}>
        Soy tu asistente Banorte. Uso MCP para conectarme a tus datos y generar al instante lo que necesitas ver: tu
        saldo, tus transferencias recientes, tus gastos, o cualquier otra consulta sobre tu cuenta.
      </Text>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => onPick(item.prompt)}
            disabled={disabled}
            accessibilityRole="button"
            style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.8 }]}
          >
            <Icon name={item.icon} size={18} color={color.onRed} strokeWidth={1.9} />
            <Text variant="bodyStrong" style={styles.suggestionText}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Thinking({ status, tools }) {
  return (
    <Card style={styles.thinking}>
      <View style={styles.thinkingHead}>
        <ActivityIndicator color={color.red} size="small" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {status ?? 'Construyendo tu pantalla…'}
        </Text>
      </View>
      {tools.length ? (
        <View style={styles.tools}>
          {tools.map((tool, index) => (
            <View key={`${tool.name}-${index}`} style={styles.tool}>
              <Icon name={tool.done ? 'check' : 'layers'} size={14} color={tool.done ? color.green : color.muted} />
              <Text variant="small" style={{ color: tool.done ? color.ink2 : color.muted }}>
                {toolLabel(tool.name)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// La pregunta de la persona, a la derecha, como en cualquier chat.
function Prompt({ text, fromHistory }) {
  return (
    <View style={styles.promptRow}>
      <View style={[styles.prompt, fromHistory && styles.promptHistory]}>
        {fromHistory ? <Icon name="history" size={14} color={color.muted} /> : null}
        <Text variant="body" style={[styles.promptText, fromHistory && { color: color.ink2 }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// Un turno del hilo: la pregunta y, debajo, lo que el agente construyó.
function Turn({ turn, isLast, agent, onSend }) {
  const { busy, status, tools } = agent;
  const { view } = turn;
  const live = isLast && busy;

  return (
    <View style={styles.turn}>
      <Prompt text={turn.prompt} fromHistory={turn.fromHistory} />

      {/* Mientras no exista superficie se ve pensar; en cuanto llega el esqueleto,
          la pantalla misma es el progreso y el estado baja a una línea. */}
      {live && !view?.surfaceId ? <Thinking status={status} tools={tools} /> : null}

      {view ? (
        <View style={styles.view}>
          <View style={{ gap: 3 }}>
            <Text variant="h2">{view.title ?? 'Tu visualización'}</Text>
            {view.message ? <Text variant="small">{view.message}</Text> : null}
          </View>

          <View style={styles.viewMeta}>
            {view.folder ? <Chip label={view.folder} tone="red" /> : null}
            <Text variant="tiny">
              {view.archived ? 'Del historial' : view.building ? 'Construyendo…' : view.patched ? 'Actualizada por el agente' : 'Generada por el agente'} · {fmtRelative(view.createdAt)}
            </Text>
          </View>

          {live && view.surfaceId ? (
            <View style={styles.buildingRow}>
              <ActivityIndicator color={color.red} size="small" />
              <Text variant="small">{status ?? 'Construyendo tu pantalla…'}</Text>
            </View>
          ) : null}

          {/* Lo que el agente aprendió en este turno y ya guardó en su memoria. */}
          {view.remembered?.length ? (
            <View style={styles.remembered}>
              <Icon name="check" size={14} color={color.green} />
              <Text variant="small" style={{ flex: 1, color: color.ink2 }}>
                Norte recordará: {view.remembered.join(' · ')}
              </Text>
            </View>
          ) : null}

          {view.movedBelow ? (
            <View style={styles.moved}>
              <Icon name="chevron" size={14} color={color.muted} />
              <Text variant="small">Esta pantalla se actualizó más abajo.</Text>
            </View>
          ) : view.surfaceId ? (
            <A2UIRenderer surfaceId={view.surfaceId} onAction={agent.sendAction} disabled={busy} />
          ) : (
            <NorteRenderer ui={view.ui} onFormSubmit={onSend} formsDisabled={busy} />
          )}

          {view.archived ? (
            <Button
              title="Preguntar de nuevo"
              variant="outline"
              icon="refresh"
              onPress={() => view.prompt && onSend(view.prompt)}
              disabled={!view.prompt || busy}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ChatTab({ agent, onSend, contentPadding }) {
  const { busy, turns, error } = agent;
  const scrollRef = useRef(null);
  // Se baja al final cuando entra un turno nuevo y mientras el último se
  // construye; si la persona subió a leer algo viejo en reposo, no se le mueve.
  const followRef = useRef(false);
  const lastCount = useRef(turns.length);

  useEffect(() => {
    if (turns.length !== lastCount.current) {
      lastCount.current = turns.length;
      followRef.current = true;
    }
  }, [turns.length]);

  useEffect(() => {
    if (!busy) followRef.current = false;
  }, [busy]);

  const onContentSizeChange = () => {
    if (followRef.current || busy) scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: contentPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={onContentSizeChange}
      >
        <ErrorBanner message={error} />

        {!turns.length && !busy ? <Welcome onPick={onSend} disabled={busy} /> : null}

        {turns.map((turn, index) => (
          <View key={turn.id}>
            {/* La línea gris que separa una pregunta de la anterior. */}
            {index > 0 ? <View style={styles.separator} /> : null}
            <Turn turn={turn} isLast={index === turns.length - 1} agent={agent} onSend={onSend} />
          </View>
        ))}

        {!busy && !turns.length && error ? (
          <EmptyState
            icon="alert"
            title="No pudimos generar la vista"
            description="Revisa la conexión con la API desde Servicios y vuelve a intentarlo."
          />
        ) : null}
      </ScrollView>

      {/* El contenido se desvanece al pasar bajo las pestañas en vez de cortarse. */}
      <ScrollFade />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.lg },

  welcome: { alignItems: 'center', paddingTop: space.xxl, gap: space.sm },
  welcomeLogo: { width: 150, height: 70, marginBottom: space.md },
  welcomeTitle: { textAlign: 'center' },
  welcomeText: { textAlign: 'center', maxWidth: 320, lineHeight: 19 },
  suggestions: { width: '100%', gap: space.md, marginTop: space.xl },
  suggestion: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: color.muted2,
    borderRadius: radius.pill,
    paddingVertical: 13,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  suggestionText: { color: color.surface },

  thinking: { gap: space.md },
  thinkingHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tools: { gap: 6 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 7 },

  separator: { height: 1, backgroundColor: color.surface3, marginBottom: space.lg, marginHorizontal: -space.lg },

  turn: { gap: space.lg },
  promptRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '88%',
    backgroundColor: color.redTint,
    borderRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  promptHistory: { backgroundColor: color.surface3 },
  promptText: { color: color.red800, flexShrink: 1 },

  view: { gap: space.lg },
  viewMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm },
  buildingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  remembered: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  moved: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm },
});

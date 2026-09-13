// Pestaña Chat: el centro de la app.
//
// Los tres pasos del reto se ven aquí en orden: se interpreta la intención
// (estado "pensando"), se consultan datos por MCP (cada herramienta aparece
// conforme se llama) y se construye la interfaz (Norte UI Spec renderizado con
// componentes nativos). Lo que la persona toca en esa interfaz —un formulario—
// vuelve al agente y genera la siguiente pantalla.

import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, EmptyState, ErrorBanner, ScrollFade, Text } from '../../components/ui';
import Icon from '../../components/Icon';
import NorteRenderer from '../../renderer/NorteRenderer';
import A2UIRenderer from '../../a2ui/A2UIRenderer';
import { toolLabel } from '../../chat/useAgent';
import { color, radius, space } from '../../theme/tokens';
import { fmtRelative } from '../../lib/format';

const SUGGESTIONS = [
  { icon: '💳', label: 'Pagar menos intereses', prompt: 'Quiero pagar menos intereses de mi tarjeta: muéstrame cómo quedaría mi saldo a meses fijos y déjame elegir el plazo.' },
  { icon: '💰', label: 'Saldo de mi cuenta', prompt: '¿Cuánto tengo en mis cuentas?' },
  { icon: '📲', label: 'Últimas Transferencias', prompt: 'Muéstrame mis últimas transferencias' },
  { icon: '📈', label: 'Resumen de Gastos', prompt: '¿En qué se me fue el dinero este mes?' },
];

function Welcome({ onPick, disabled }) {
  return (
    <View style={styles.welcome}>
      <Image source={require('../../../assets/brand/Banorte_Header.png')} style={styles.welcomeLogo} resizeMode="contain" />
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
            <Text variant="bodyStrong" style={styles.suggestionText}>
              {`${item.icon}  ${item.label}`}
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
            <View key={`${tool.name}-${index}`} style={[styles.tool, tool.done && styles.toolDone]}>
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

export default function ChatTab({ agent, onSend, contentPadding }) {
  const { busy, status, tools, view, error } = agent;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: contentPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ErrorBanner message={error} />

        {/* Mientras no exista superficie se ve pensar; en cuanto llega el esqueleto,
            la pantalla misma es el progreso y el estado baja a una línea. */}
        {busy && !view?.surfaceId ? <Thinking status={status} tools={tools} /> : null}

        {!busy && !view ? <Welcome onPick={onSend} disabled={busy} /> : null}

        {view ? (
          <View style={styles.view}>
            <View style={styles.viewHead}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="h2">{view.title ?? 'Tu visualización'}</Text>
                {view.message ? <Text variant="small">{view.message}</Text> : null}
              </View>
            </View>

            <View style={styles.viewMeta}>
              {view.folder ? <Chip label={view.folder} tone="red" /> : null}
              <Text variant="tiny">
                {view.archived ? 'Del historial' : view.building ? 'Construyendo…' : 'Generada por el agente'} · {fmtRelative(view.createdAt)}
              </Text>
            </View>

            {busy && view.surfaceId ? (
              <View style={styles.buildingRow}>
                <ActivityIndicator color={color.red} size="small" />
                <Text variant="small">{status ?? 'Construyendo tu pantalla…'}</Text>
              </View>
            ) : null}

            {view.surfaceId ? (
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

        {!busy && !view && error ? (
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
    backgroundColor: color.muted2,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  suggestionText: { color: color.surface },

  thinking: { gap: space.md },
  thinkingHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tools: { gap: 6 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolDone: { opacity: 1 },

  view: { gap: space.lg },
  viewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  viewMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm },
  buildingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

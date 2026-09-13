// Widget "Norte AI" para la pantalla de inicio de Android.
//
// Es el acceso más corto que existe al asistente: dos toques desde el
// escritorio del teléfono hasta una pantalla generada por el agente. Los dos
// botones abren la app por deep link y no hacen nada más — el widget no habla
// con la API ni guarda estado, así que nunca puede quedar desincronizado.
//
//   Abrir → norteai://chat?mode=text  (teclado listo)
//   Voz   → norteai://chat?mode=voice (empieza a grabar)
//
// Android puede reentregar el mismo intent; por eso cada uri lleva `t`, una
// marca de tiempo que la app usa para distinguir un toque nuevo del anterior.
//
// El diseño sigue al widget de Claude: tarjeta oscura, arriba una píldora con
// la marca en un disco rojo y la palabra "Asistente", abajo dos botones
// redondos grandes sin etiqueta (el icono basta: teclado y micrófono).
//
// Cada launcher tiene celdas de distinto tamaño y además el widget se puede
// estirar, así que nada mide fijo: todo sale del ancho y alto reales que
// Android reporta (`widgetInfo`), y los botones crecen hasta llenar lo que la
// píldora deja libre. En una celda chica se ve compacto; en una grande, holgado.

import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

const COLORS = {
  surface: '#2b2b2b',
  pill: '#3c3c3c',
  button: '#3c3c3c',
  red: '#eb0029',
  text: '#f2f2f4',
};

const ICON_APP = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="2.5" width="12" height="19" rx="2.6" fill="none" stroke="#f2f2f4" stroke-width="1.7"/>
  <path d="M9.5 7h5M9.5 10.5h5M9.5 14h3" stroke="#f2f2f4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_MIC = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="9" y="3" width="6" height="11" rx="3" fill="#ffffff"/>
  <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

// Tamaño de referencia (2x2 en un launcher típico) para cuando Android no
// reporta medidas, por ejemplo en la vista previa.
const DEFAULT_SIZE = 176;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Todas las medidas del widget a partir de su ancho y alto en dp.
export function layoutFor(width = DEFAULT_SIZE, height = DEFAULT_SIZE) {
  const pad = clamp(Math.round(Math.min(width, height) * 0.07), 10, 16);
  const gap = clamp(Math.round(height * 0.06), 8, 14);
  const pillHeight = clamp(Math.round(height * 0.36), 54, 80);
  const disc = pillHeight - 18;
  const fitWidth = Math.floor((width - pad * 2 - gap * 2) / 2);
  const fitHeight = height - pad * 2 - pillHeight - gap;
  const button = clamp(Math.min(fitWidth, fitHeight), 52, 104);
  return {
    pad,
    gap,
    radius: clamp(Math.round(Math.min(width, height) * 0.17), 22, 34),
    pillHeight,
    disc,
    logoWidth: Math.round(disc * 0.57),
    logoHeight: Math.round(disc * 0.36),
    font: clamp(Math.round(pillHeight * 0.26), 14, 19),
    button,
    icon: Math.round(button * 0.47),
  };
}

// Botón circular grande. La etiqueta solo la lee el lector de pantalla.
function ActionButton({ svg, label, uri, stamp, size, icon }) {
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.button,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `${uri}&t=${stamp}` }}
      accessibilityLabel={label}
    >
      <SvgWidget svg={svg} style={{ width: icon, height: icon }} />
    </FlexWidget>
  );
}

export function NorteWidget({ name, widgetInfo }) {
  // La marca de tiempo se calcula al renderizar el widget, no al tocarlo: es
  // suficiente para que dos toques seguidos tras un redibujo no se confundan.
  const stamp = Date.now();
  const label = name ? `Norte AI, asistente Banorte de ${name}` : 'Norte AI, asistente Banorte';
  const size = layoutFor(widgetInfo?.width, widgetInfo?.height);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.surface,
        borderRadius: size.radius,
        padding: size.pad,
      }}
      clickAction="OPEN_APP"
      accessibilityLabel={label}
    >
      {/* Píldora: toca aquí y se abre el chat escrito. */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: COLORS.pill,
          borderRadius: size.pillHeight / 2,
          paddingHorizontal: 9,
          height: size.pillHeight,
          width: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: `norteai://chat?mode=text&t=${stamp}` }}
        accessibilityLabel="Asistente"
      >
        <FlexWidget
          style={{
            width: size.disc,
            height: size.disc,
            borderRadius: size.disc / 2,
            backgroundColor: COLORS.red,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ImageWidget
            image={require('../assets/brand/Banorte_White.png')}
            imageWidth={size.logoWidth}
            imageHeight={size.logoHeight}
          />
        </FlexWidget>
        <TextWidget
          text="Asistente"
          maxLines={1}
          truncate="END"
          style={{ fontSize: size.font, fontWeight: '700', color: COLORS.text, marginLeft: 11 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-evenly', marginTop: size.gap }}
      >
        <ActionButton
          svg={ICON_APP}
          label="Abrir el chat"
          uri="norteai://chat?mode=text"
          stamp={stamp}
          size={size.button}
          icon={size.icon}
        />
        <ActionButton
          svg={ICON_MIC}
          label="Hablar por voz"
          uri="norteai://chat?mode=voice"
          stamp={stamp}
          size={size.button}
          icon={size.icon}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

export default NorteWidget;

// Widget "Norte AI" para la pantalla de inicio de Android (2x2).
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
// El diseño es un cuadrado oscuro: arriba una píldora con la marca en un disco
// rojo y la palabra "Asistente"; abajo los dos botones redondos con su
// etiqueta. Todo se dimensiona en fracciones del ancho para que se vea igual
// en un launcher con celdas grandes que en uno con celdas chicas.

import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

const COLORS = {
  surface: '#2b2b2b',
  pill: '#3c3c3c',
  button: '#3c3c3c',
  red: '#eb0029',
  text: '#f2f2f4',
  muted: '#b3b3bd',
};

const ICON_APP = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="2.5" width="12" height="19" rx="2.6" fill="none" stroke="#f2f2f4" stroke-width="1.7"/>
  <path d="M9.5 7h5M9.5 10.5h5M9.5 14h3" stroke="#f2f2f4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_MIC = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="9" y="3" width="6" height="11" rx="3" fill="#ffffff"/>
  <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

// Botón circular con su etiqueta debajo.
function ActionButton({ svg, label, uri, stamp }) {
  return (
    <FlexWidget
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `${uri}&t=${stamp}` }}
      accessibilityLabel={label}
    >
      <FlexWidget
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: COLORS.button,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SvgWidget svg={svg} style={{ width: 24, height: 24 }} />
      </FlexWidget>
      <TextWidget text={label} style={{ fontSize: 12, color: COLORS.muted, marginTop: 8 }} />
    </FlexWidget>
  );
}

export function NorteWidget({ name }) {
  // La marca de tiempo se calcula al renderizar el widget, no al tocarlo: es
  // suficiente para que dos toques seguidos tras un redibujo no se confundan.
  const stamp = Date.now();
  const label = name ? `Norte AI, asistente Banorte de ${name}` : 'Norte AI, asistente Banorte';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.surface,
        borderRadius: 28,
        padding: 14,
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
          borderRadius: 30,
          paddingHorizontal: 10,
          paddingVertical: 8,
          width: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: `norteai://chat?mode=text&t=${stamp}` }}
        accessibilityLabel="Asistente"
      >
        <FlexWidget
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: COLORS.red,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ImageWidget image={require('../assets/brand/Banorte_White.png')} imageWidth={22} imageHeight={14} />
        </FlexWidget>
        <TextWidget
          text="Asistente"
          maxLines={1}
          style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginLeft: 12 }}
        />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'center', marginTop: 12 }}>
        <ActionButton svg={ICON_APP} label="Abrir" uri="norteai://chat?mode=text" stamp={stamp} />
        <ActionButton svg={ICON_MIC} label="Voz" uri="norteai://chat?mode=voice" stamp={stamp} />
      </FlexWidget>
    </FlexWidget>
  );
}

export default NorteWidget;

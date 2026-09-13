// Manejador de los eventos del widget.
//
// Android lo invoca fuera de la app (al agregar el widget, al redimensionarlo o
// al pedir una actualización) en un contexto headless: aquí no hay pantalla, ni
// navegación, ni providers de React. Por eso el widget solo lee un dato —el
// nombre con el que saluda— y todo lo demás lo resuelve con deep links.

import * as SecureStore from 'expo-secure-store';
import { NorteWidget } from './NorteWidget';

const WIDGETS = { NorteAssistant: NorteWidget };

// El nombre lo escribe la app al iniciar sesión. Si el llavero no está
// disponible en este contexto, el widget saluda de forma genérica: nunca se
// queda sin dibujar por esto.
async function readPreferredName() {
  try {
    const raw = await SecureStore.getItemAsync('norte.session.user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return typeof user?.preferredName === 'string' ? user.preferredName : null;
  } catch {
    return null;
  }
}

export async function widgetTaskHandler(props) {
  const Widget = WIDGETS[props.widgetInfo.widgetName];
  if (!Widget) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget name={await readPreferredName()} />);
      break;

    // Los toques no llegan aquí: los dos botones usan OPEN_URI y Android abre
    // la app directamente, sin despertar JavaScript.
    case 'WIDGET_CLICK':
    case 'WIDGET_DELETED':
    default:
      break;
  }
}

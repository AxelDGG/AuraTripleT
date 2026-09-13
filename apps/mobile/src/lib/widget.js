// Refresco del widget desde la app.
//
// El widget saluda con el nombre de la sesión, así que hay que redibujarlo
// cuando ese nombre cambia (al entrar y al salir). Es lo único que la app le
// pide al widget: el resto lo resuelve él solo con deep links.

import { Platform } from 'react-native';

export async function refreshWidget() {
  if (Platform.OS !== 'android') return;
  try {
    const [{ requestWidgetUpdate }, { NorteWidget }] = await Promise.all([
      import('react-native-android-widget'),
      import('../../widget/NorteWidget'),
    ]);
    const name = await readName();
    await requestWidgetUpdate({
      widgetName: 'NorteAssistant',
      renderWidget: () => <NorteWidget name={name} />,
      // Sin widget en la pantalla de inicio no hay nada que hacer y no es un error.
      widgetNotFound: () => {},
    });
  } catch {
    // El widget es un extra: si falla, la app no se entera.
  }
}

async function readName() {
  try {
    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync('norte.session.user');
    return raw ? (JSON.parse(raw)?.preferredName ?? null) : null;
  } catch {
    return null;
  }
}

// Arranque de la app.
//
// Orden: tipografía y splash → contexto de sesión → navegación con deep links.
//
// Regla que se ganó a golpes: **nada puede impedir que el splash se quite.**
// La primera versión lo condicionaba a que la navegación estuviera lista, y
// como sin sesión no montaba ningún navegador, ese evento nunca llegaba: la app
// corría perfecta debajo de un splash eterno, sin un solo error en el log. Un
// arranque que puede quedarse trabado en silencio es el peor modo de falla que
// existe para una demo, así que ahora el splash depende de una sola cosa (la
// tipografía) y además tiene un tope de tiempo.

import { useEffect, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
// Importarlo aquí registra los globals de WebRTC antes de que cualquier
// pantalla los necesite. El provider da contexto a la llamada con ElevenLabs.
import { ConversationProvider } from '@elevenlabs/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

import { AuthProvider } from './src/auth/AuthProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/ref';
import { linking } from './src/navigation/linking';
import { color } from './src/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Si la tipografía no está lista en este tiempo, se arranca con la del sistema.
// Perder Manrope es feo; no arrancar es inaceptable.
const FONT_TIMEOUT_MS = 3000;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded || Boolean(fontError) || timedOut;

  // La barra de botones de Android se esconde mientras la app está al frente
  // (aparece con un deslizamiento desde abajo y se vuelve a ir sola). Se
  // vuelve a pedir cada vez que la app regresa al frente porque el sistema la
  // restaura al cambiar de app.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const hide = () => {
      try {
        NavigationBar.setHidden(true);
      } catch {
        // Sin barra que esconder (gestos) no pasa nada.
      }
    };
    hide();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hide();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Misma marca y tamaño que el splash nativo: al quitarse, no se nota el cambio.
  if (!ready) {
    return (
      <View style={styles.splash}>
        <Image source={require('./assets/brand/Banorte_Mark_White.png')} style={styles.splashLogo} resizeMode="contain" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ConversationProvider>
            <NavigationContainer ref={navigationRef} linking={linking}>
              <RootNavigator />
            </NavigationContainer>
          </ConversationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 156, height: 99 },
});

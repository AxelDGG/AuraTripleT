// Configuración de la app Expo (dev build, no Expo Go: el widget de Android
// necesita código nativo).
//
// `PUBLIC_API_URL` es la única variable que cambia entre demo local y Vultr: se
// lee al generar el bundle y queda en `extra.apiUrl`. La app además permite
// sobreescribirla en caliente desde Servicios → Conexión, para no tener que
// recompilar si cambia la IP el día del hackathon.

const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3040';

module.exports = {
  expo: {
    name: 'Norte AI',
    slug: 'norte-ai',
    scheme: 'norteai',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#eb0029',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      bundleIdentifier: 'mx.auratriplet.norteai',
      supportsTablet: false,
      infoPlist: {
        NSFaceIDUsageDescription: 'Usamos Face ID para desbloquear tu sesión de Banorte sin escribir tu contraseña.',
        NSMicrophoneUsageDescription: 'Usamos el micrófono para que puedas hablar con el asistente Norte AI.',
        // El API local de la demo es HTTP; en Vultr la app habla HTTPS.
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    android: {
      package: 'mx.auratriplet.norteai',
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
        backgroundColor: '#eb0029',
      },
      permissions: [
        'android.permission.INTERNET',
        'android.permission.RECORD_AUDIO',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.VIBRATE',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: false,
          data: [{ scheme: 'norteai', host: 'chat' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      'expo-secure-store',
      'expo-font',
      'expo-audio',
      [
        'expo-local-authentication',
        { faceIDPermission: 'Usamos Face ID para desbloquear tu sesión de Banorte.' },
      ],
      [
        'expo-splash-screen',
        { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#eb0029' },
      ],
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            minSdkVersion: 24,
            // Android bloquea el tráfico sin cifrar desde la versión 9, y esta
            // app habla con una API http:// mientras corre en una laptop.
            //
            // Va aquí y no en `android.usesCleartextTraffic` del bloque de
            // arriba: esa llave existe y `expo config` la reporta, pero
            // `prebuild` NO la escribe en el manifest en SDK 57. El síntoma es
            // malo de diagnosticar — la app instala, abre y toda petición falla
            // sin decir por qué. expo-build-properties sí escribe el atributo.
            //
            // En Vultr la app habla HTTPS y esto deja de importar.
            usesCleartextTraffic: true,
          },
        },
      ],
      // Sin esto el build nativo no compila en Windows: ver el archivo.
      './plugins/withWindowsLongPaths',
      [
        'react-native-android-widget',
        {
          widgets: [
            {
              // Debe coincidir con el `name` que devuelve widget/task-handler.js
              name: 'NorteAssistant',
              label: 'Norte AI',
              description: 'Habla o escribe con el asistente Banorte',
              // Cuadrado de 2x2 celdas: píldora "Asistente" arriba y dos
              // botones redondos (Abrir · Voz) abajo.
              minWidth: '110dp',
              minHeight: '110dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'none',
              // Sin actualizaciones periódicas: el widget se refresca cuando la
              // app lo pide (tras un login o un cambio de saldo), no cada media hora.
              updatePeriodMillis: 0,
            },
          ],
        },
      ],
    ],
    extra: {
      apiUrl: API_URL,
      eas: { projectId: process.env.EAS_PROJECT_ID || undefined },
    },
  },
};

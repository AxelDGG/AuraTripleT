// Deep links del widget de Android.
//
//   norteai://chat?mode=voice → abre la app grabando
//   norteai://chat?mode=text  → abre la app con el teclado listo
//
// El parámetro `t` es una marca de tiempo que agrega el widget: Android puede
// reentregar el mismo intent, y sin ella la app no sabría si es un toque nuevo
// o el mismo de antes.

import * as Linking from 'expo-linking';

// Las pestañas cuelgan de la pantalla `App` del stack raíz, así que la
// configuración tiene que anidarse igual. Sin sesión no existen: el link se
// queda esperando y AssistantScreen lo vuelve a leer al montarse, después del
// login o del desbloqueo.
export const linking = {
  prefixes: [Linking.createURL('/'), 'norteai://'],
  config: {
    screens: {
      App: {
        screens: {
          Cuentas: 'cuentas',
          Transferencias: 'transferencias',
          Chat: 'chat',
          Inversiones: 'inversiones',
          Servicios: 'servicios',
        },
      },
    },
  },
};

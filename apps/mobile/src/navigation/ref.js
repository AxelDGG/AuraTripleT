// Referencia al contenedor de navegación.
//
// La franja superior vive fuera del navegador de pestañas (es común a todas),
// así que no puede usar `useNavigation`. Con esta referencia el botón de perfil
// puede llevar a Servicios sin que TopBar tenga que recibir props desde tres
// niveles más arriba.

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigateTo(name, params) {
  if (navigationRef.isReady()) navigationRef.navigate(name, params);
}

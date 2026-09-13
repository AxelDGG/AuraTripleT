import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './widget/task-handler';

registerRootComponent(App);

// El manejador del widget se registra fuera del árbol de React: Android lo
// invoca aunque la app no esté abierta, así que no puede depender de que haya
// una pantalla montada.
registerWidgetTaskHandler(widgetTaskHandler);

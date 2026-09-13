// Navegación.
//
// Hay SIEMPRE un navegador montado, incluso sin sesión. No es un detalle
// estético: `NavigationContainer.onReady` solo dispara cuando monta un
// navegador, y los deep links del widget tampoco se resuelven sin uno. Cuando
// las pantallas de login eran Views sueltas, la app arrancaba bien pero se
// quedaba atorada en el splash para siempre.
//
// El estado de sesión decide qué pantalla vive dentro del stack. Así no hay
// guardas repartidas por las pantallas ni redirecciones a mitad de render: si no
// hay sesión, las pantallas privadas sencillamente no existen.

import { Image, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { STATUS, useAuth } from '../auth/AuthProvider';
import { DashboardProvider } from '../lib/useDashboard';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import UnlockScreen from '../screens/UnlockScreen';
import AssistantScreen from '../screens/AssistantScreen';
import CuentasScreen from '../screens/CuentasScreen';
import TransferenciasScreen from '../screens/TransferenciasScreen';
import InversionesScreen from '../screens/InversionesScreen';
import ServiciosScreen from '../screens/ServiciosScreen';
import { navigateTo } from './ref';
import { color } from '../theme/tokens';

const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// Mientras se lee el llavero. Dura milisegundos, pero tiene que ser una
// pantalla del stack como cualquier otra.
function BootScreen() {
  return (
    <View style={styles.boot}>
      <StatusBar style="light" />
      <Image source={require('../../assets/brand/Banorte_Mark_White.png')} style={styles.bootLogo} resizeMode="contain" />
      <Loading label="" />
    </View>
  );
}

// El orden es el de la barra inferior de la referencia: el asistente al centro.
function AppShell() {
  const { user } = useAuth();

  return (
    <DashboardProvider>
      <View style={styles.shell}>
        <StatusBar style="light" />
        <TopBar user={user} onPressProfile={() => navigateTo('Servicios')} />
        <Tabs.Navigator
          initialRouteName="Chat"
          tabBar={(props) => <BottomNav {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.surface2 } }}
        >
          <Tabs.Screen name="Cuentas" component={CuentasScreen} />
          <Tabs.Screen name="Transferencias" component={TransferenciasScreen} />
          <Tabs.Screen name="Chat" component={AssistantScreen} />
          <Tabs.Screen name="Inversiones" component={InversionesScreen} />
          <Tabs.Screen name="Servicios" component={ServiciosScreen} />
        </Tabs.Navigator>
      </View>
    </DashboardProvider>
  );
}

export default function RootNavigator() {
  const { status } = useAuth();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {status === STATUS.LOADING ? (
        <RootStack.Screen name="Arranque" component={BootScreen} />
      ) : status === STATUS.SIGNED_OUT ? (
        <RootStack.Screen name="Login" component={LoginScreen} />
      ) : status === STATUS.LOCKED ? (
        <RootStack.Screen name="Desbloqueo" component={UnlockScreen} />
      ) : (
        <RootStack.Screen name="App" component={AppShell} />
      )}
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.surface2 },
  boot: { flex: 1, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center' },
  bootLogo: { width: 156, height: 99, marginBottom: 24 },
});

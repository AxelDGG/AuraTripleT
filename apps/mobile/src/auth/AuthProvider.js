// Estado de sesión de toda la app.
//
// Cuatro estados y ninguno más:
//   loading   — leyendo el llavero al arrancar
//   signedOut — no hay token: pantalla de login
//   locked    — hay token guardado y biometría activa: pantalla de desbloqueo
//   signedIn  — adentro
//
// La separación entre `locked` y `signedOut` es la que hace que la app se
// sienta de banco: la segunda vez no escribes contraseña, pones el dedo.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as endpoints from '../api/endpoints';
import { configureClient } from '../api/client';
import { loadStoredBaseUrl } from '../lib/config';
import { refreshWidget } from '../lib/widget';
import {
  clearSession,
  inspectDevice,
  isBiometricEnabled,
  promptBiometrics,
  readSession,
  saveSession,
  setBiometricEnabled,
} from './biometrics';

const AuthContext = createContext(null);

export const STATUS = {
  LOADING: 'loading',
  SIGNED_OUT: 'signedOut',
  LOCKED: 'locked',
  SIGNED_IN: 'signedIn',
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(STATUS.LOADING);
  const [user, setUser] = useState(null);
  const [device, setDevice] = useState({ available: false, kind: 'none' });
  const [biometricOn, setBiometricOn] = useState(false);
  const [error, setError] = useState(null);

  // El token vive en una ref, no en el estado: el cliente HTTP lo lee en cada
  // petición y no queremos re-render por leerlo.
  const tokenRef = useRef(null);

  // El cliente HTTP pregunta por el token y avisa cuando la API responde 401.
  useEffect(() => {
    configureClient({
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        tokenRef.current = null;
        setUser(null);
        setStatus(STATUS.SIGNED_OUT);
        clearSession();
      },
    });
  }, []);

  // Arranque: URL de la API, capacidades del dispositivo y sesión guardada.
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadStoredBaseUrl();
      const [capabilities, enabled, stored] = await Promise.all([
        inspectDevice(),
        isBiometricEnabled(),
        readSession(),
      ]);
      if (!alive) return;

      setDevice(capabilities);
      setBiometricOn(enabled && capabilities.available);

      if (!stored?.token) {
        setStatus(STATUS.SIGNED_OUT);
        return;
      }

      tokenRef.current = stored.token;
      setUser(stored.user);

      // Con biometría activa no se valida contra el servidor todavía: primero
      // el dedo, y así la pantalla de desbloqueo aparece al instante aunque la
      // red esté lenta.
      if (enabled && capabilities.available) {
        setStatus(STATUS.LOCKED);
        return;
      }

      try {
        const session = await endpoints.fetchSession();
        if (!alive) return;
        setUser(session.user);
        setStatus(STATUS.SIGNED_IN);
      } catch {
        if (!alive) return;
        tokenRef.current = null;
        await clearSession();
        setStatus(STATUS.SIGNED_OUT);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    setError(null);
    try {
      const { token, user: profile } = await endpoints.login(username, password);
      tokenRef.current = token;
      await saveSession({ token, user: profile });
      setUser(profile);
      setStatus(STATUS.SIGNED_IN);
      // El widget saluda con el nombre de la sesión: se redibuja al entrar.
      refreshWidget();
      return { ok: true, user: profile };
    } catch (err) {
      const message = err?.message ?? 'No se pudo iniciar sesión.';
      setError(message);
      return { ok: false, error: message };
    }
  }, []);

  // Desbloqueo biométrico: el sistema aprueba, y recién entonces se comprueba
  // que el token siga vivo. Si el servidor lo rechazó, se cae al login.
  const unlock = useCallback(async () => {
    setError(null);
    const result = await promptBiometrics(
      device.kind === 'face' ? 'Desbloquea Banorte con tu rostro' : 'Desbloquea Banorte con tu huella',
    );
    if (!result.ok) {
      if (!result.cancelled) setError('No pudimos verificar tu identidad. Intenta de nuevo.');
      return { ok: false, cancelled: result.cancelled };
    }
    try {
      const session = await endpoints.fetchSession();
      setUser(session.user);
      setStatus(STATUS.SIGNED_IN);
      return { ok: true };
    } catch {
      tokenRef.current = null;
      await clearSession();
      setStatus(STATUS.SIGNED_OUT);
      setError('Tu sesión expiró. Vuelve a entrar con tu contraseña.');
      return { ok: false };
    }
  }, [device.kind]);

  const enableBiometrics = useCallback(async () => {
    if (!device.available) return { ok: false };
    const result = await promptBiometrics('Confirma para activar el acceso rápido');
    if (!result.ok) return { ok: false, cancelled: result.cancelled };
    await setBiometricEnabled(true);
    setBiometricOn(true);
    return { ok: true };
  }, [device.available]);

  const disableBiometrics = useCallback(async () => {
    await setBiometricEnabled(false);
    setBiometricOn(false);
  }, []);

  const signOut = useCallback(async () => {
    await endpoints.logout();
    tokenRef.current = null;
    await clearSession();
    setUser(null);
    setError(null);
    setStatus(STATUS.SIGNED_OUT);
    refreshWidget();
  }, []);

  // Volver a la pantalla de bloqueo sin cerrar sesión (el botón "Salir" de la
  // franja superior, cuando hay biometría activa).
  const lock = useCallback(() => {
    if (biometricOn && tokenRef.current) setStatus(STATUS.LOCKED);
    else signOut();
  }, [biometricOn, signOut]);

  const value = useMemo(
    () => ({
      status,
      user,
      device,
      biometricOn,
      error,
      setError,
      signIn,
      unlock,
      signOut,
      lock,
      enableBiometrics,
      disableBiometrics,
      getToken: () => tokenRef.current,
    }),
    [status, user, device, biometricOn, error, signIn, unlock, signOut, lock, enableBiometrics, disableBiometrics],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return context;
}

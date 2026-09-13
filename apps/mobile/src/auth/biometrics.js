// Biometría del dispositivo.
//
// El servidor nunca ve una huella ni una cara: el sistema operativo responde sí
// o no, y solo con un sí la app lee el token que ya tenía guardado en el
// llavero. Es lo que hace la banca real y evita inventarnos un protocolo
// biométrico propio, que sería la parte más fácil de romper de todo esto.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const { AuthenticationType } = LocalAuthentication;

// El tipo que ofrece el dispositivo define el copy y el ícono: no se le pide
// "huella" a un iPhone con Face ID ni "rostro" a un Android con lector trasero.
export const BIOMETRY = {
  FACE: 'face',
  FINGERPRINT: 'fingerprint',
  IRIS: 'iris',
  NONE: 'none',
};

const LABELS = {
  [BIOMETRY.FACE]: { name: 'Face ID', action: 'Entrar con Face ID', icon: 'face' },
  [BIOMETRY.FINGERPRINT]: { name: 'huella', action: 'Entrar con huella', icon: 'fingerprint' },
  [BIOMETRY.IRIS]: { name: 'iris', action: 'Entrar con iris', icon: 'face' },
  [BIOMETRY.NONE]: { name: 'código', action: 'Entrar con el código del dispositivo', icon: 'lock' },
};

export const biometryLabel = (kind) => LABELS[kind] ?? LABELS[BIOMETRY.NONE];

// Qué puede hacer este teléfono: hay hardware, hay algo registrado y de qué tipo.
export async function inspectDevice() {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    let kind = BIOMETRY.NONE;
    if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) kind = BIOMETRY.FACE;
    else if (types.includes(AuthenticationType.FINGERPRINT)) kind = BIOMETRY.FINGERPRINT;
    else if (types.includes(AuthenticationType.IRIS)) kind = BIOMETRY.IRIS;

    return { hasHardware, isEnrolled, kind, available: hasHardware && isEnrolled };
  } catch {
    return { hasHardware: false, isEnrolled: false, kind: BIOMETRY.NONE, available: false };
  }
}

// `disableDeviceFallback: false` deja que el sistema acepte el PIN o patrón si
// la biometría falla tres veces: sin eso, una huella mojada deja a la persona
// fuera de su banco.
export async function promptBiometrics(promptMessage = 'Desbloquea tu sesión de Banorte') {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Usar contraseña',
      fallbackLabel: 'Usar código del dispositivo',
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    // `user_cancel` y `system_cancel` no son errores que valga la pena gritar.
    return { ok: false, cancelled: /cancel/i.test(result.error ?? ''), error: result.error ?? 'unknown' };
  } catch (err) {
    return { ok: false, cancelled: false, error: String(err?.message ?? err) };
  }
}

// ---------- Llavero ----------
//
// El token va a SecureStore (Keychain en iOS, EncryptedSharedPreferences en
// Android). `requireAuthentication` no se usa a propósito: preferimos pedir la
// biometría nosotros y poder mostrar un error propio si falla.

const TOKEN_KEY = 'norte.session.token';
const USER_KEY = 'norte.session.user';
const BIOMETRIC_KEY = 'norte.session.biometricEnabled';

export async function saveSession({ token, user }) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function readSession() {
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    if (!token) return null;
    return { token, user: rawUser ? JSON.parse(rawUser) : null };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => {}),
  ]);
}

export async function setBiometricEnabled(enabled) {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? '1' : '0');
}

export async function isBiometricEnabled() {
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
  } catch {
    return false;
  }
}

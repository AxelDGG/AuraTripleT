// Dónde vive la API.
//
// Prioridad: lo que la persona guardó en Servicios → Conexión, luego
// `PUBLIC_API_URL` del build (extra.apiUrl), y al final localhost. El override
// en caliente existe porque en un hackathon la URL cambia (IP de la laptop,
// túnel, servidor de Vultr) y recompilar cuesta 20 minutos.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'norte.apiUrl';
const FALLBACK = 'http://localhost:3040';

// El emulador de Android no ve el localhost de la laptop: 10.0.2.2 es el alias
// que Google expone para el host. En un teléfono real no aplica.
function adaptForEmulator(url) {
  if (Platform.OS !== 'android') return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i, '$110.0.2.2');
}

export function normalizeBaseUrl(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  return adaptForEmulator(withScheme);
}

const buildDefault = normalizeBaseUrl(Constants.expoConfig?.extra?.apiUrl) ?? FALLBACK;

let current = buildDefault;
const listeners = new Set();

export const getBaseUrl = () => current;
export const getBuildDefault = () => buildDefault;

function announce() {
  for (const listener of listeners) listener(current);
}

export function onBaseUrlChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Se llama una vez al arrancar, antes de la primera petición.
export async function loadStoredBaseUrl() {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    const normalized = normalizeBaseUrl(stored);
    if (normalized) {
      current = normalized;
      announce();
    }
  } catch {
    // Llavero no disponible: se queda la URL del build.
  }
  return current;
}

export async function setBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return current;
  current = normalized;
  announce();
  try {
    await SecureStore.setItemAsync(STORE_KEY, normalized);
  } catch {
    // Si no se pudo persistir, al menos vale para esta sesión.
  }
  return current;
}

export async function resetBaseUrl() {
  current = buildDefault;
  announce();
  try {
    await SecureStore.deleteItemAsync(STORE_KEY);
  } catch {
    // sin efecto
  }
  return current;
}

export const apiUrl = (path) => `${current}${path.startsWith('/') ? path : `/${path}`}`;

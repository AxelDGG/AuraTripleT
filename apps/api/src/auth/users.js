// Usuarios sintéticos de la demo.
//
// Son nuestra "API propia" de identidad: no hay proveedor externo ni datos
// reales. La contraseña nunca se guarda en claro — se verifica con scrypt y
// comparación en tiempo constante, igual que lo haría un backend de verdad.
//
// El `customerId` es lo que ata la sesión a los datos bancarios: el historial
// de visualizaciones se archiva con el cliente de la sesión, no con un id fijo.
//
// Credenciales de la demo (sintéticas, documentadas en .env.example y el README):
//   regina / Banorte2026   ·   carlos / Banorte2026   ·   maria / Banorte2026

import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

// `preferredName` es el nombre con el que la app saluda ("Hola Regina"); el
// perfil bancario completo sigue viniendo de la herramienta MCP
// `get_customer_profile`, que es la única fuente de verdad de los datos.
const USERS = [
  {
    id: 'USR-001',
    username: 'regina',
    preferredName: 'Regina',
    fullName: 'Regina Álvarez Treviño',
    customerId: 'CLT-889201',
    segment: 'Preferente',
    passwordHash: 'scrypt$1810df09bbedc358964cc3ee9c274831$50b62245c721d8fb32b095ab44d306007c07fb95756a3169a74b20a01935e22b',
  },
  {
    id: 'USR-002',
    username: 'carlos',
    preferredName: 'Carlos',
    fullName: 'Carlos Mendoza Ruiz',
    customerId: 'CLT-889201',
    segment: 'Preferente',
    passwordHash: 'scrypt$0669af8fe153d04bd10105c5d68f8446$88208eaf8fd4fde98f82b9a625cfdd083099c6f90e2ae5d499c60677487bd3d2',
  },
  {
    id: 'USR-003',
    username: 'maria',
    preferredName: 'María Fernanda',
    fullName: 'María Fernanda López García',
    customerId: 'CLT-889201',
    segment: 'Preferente',
    passwordHash: 'scrypt$4d513b8c2ba4db1457d32560c230a320$d509f2f3170d60bf28900932d8609d87688b56c57fa84c1e45eb1d1a891ed61c',
  },
];

const byUsername = new Map(USERS.map((user) => [user.username, user]));

// Último ingreso por usuario. Vive en memoria a propósito: es un dato de
// presentación ("Último ingreso: 11-09-2026 12:05:34 Vía Web"), no un registro
// de auditoría. Si más adelante importa, se mueve a una tabla de Tiger.
const lastLogins = new Map();

const derive = (password, salt) =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key)));
  });

// Se compara siempre el mismo número de bytes: un usuario inexistente cuesta lo
// mismo que una contraseña incorrecta, así el endpoint no filtra qué usuarios existen.
const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(KEY_LENGTH * 2);

export async function verifyCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const user = byUsername.get(username.trim().toLowerCase());
  const [, saltHex, hashHex] = (user?.passwordHash ?? DUMMY_HASH).split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
  return matches && user ? user : null;
}

export function findUserById(id) {
  return USERS.find((user) => user.id === id) ?? null;
}

// Registra el ingreso y devuelve el anterior, que es el que la app muestra en
// la franja superior: al entrar te interesa cuándo fue la vez pasada, no ahora.
export function recordLogin(userId, channel) {
  const previous = lastLogins.get(userId) ?? null;
  lastLogins.set(userId, { at: new Date().toISOString(), channel });
  return previous;
}

// Forma pública del usuario: nunca sale el hash de aquí.
export function publicUser(user, lastLogin = lastLogins.get(user.id) ?? null) {
  return {
    id: user.id,
    username: user.username,
    preferredName: user.preferredName,
    fullName: user.fullName,
    customerId: user.customerId,
    segment: user.segment,
    lastLogin,
  };
}

export const DEMO_USERNAMES = USERS.map((user) => user.username);

// Solo para pruebas: permite generar un hash con los mismos parámetros.
export async function hashPassword(password, salt = randomBytes(16)) {
  const key = await derive(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

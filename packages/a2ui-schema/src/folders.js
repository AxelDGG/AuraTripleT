// Carpetas del historial de visualizaciones.
//
// Son un catálogo CERRADO: el agente elige una por respuesta y el panel derecho
// de la web las muestra como secciones desplegables. Si el modelo manda una
// carpeta que no existe (o no manda ninguna), cae en `otros` en vez de
// inventarse una sección nueva en la UI.

export const FOLDERS = [
  {
    id: 'transacciones',
    label: 'Transacciones',
    hint: 'transferencias, pagos, SPEI, folios y confirmaciones de una operación que se acaba de ejecutar.',
  },
  {
    id: 'promociones',
    label: 'Promociones',
    hint: 'ofertas del banco, productos de crédito, tasas, simulaciones de crédito y recomendaciones comerciales.',
  },
  {
    id: 'movimientos',
    label: 'Movimientos',
    hint: 'saldos, estados de cuenta, listas de movimientos e historial de las cuentas del cliente.',
  },
  {
    id: 'gastos',
    label: 'Gastos',
    hint: 'análisis de consumo: gasto por categoría, presupuesto, tendencias y comparativos de gasto.',
  },
  {
    id: 'otros',
    label: 'Otros',
    hint: 'lo que no encaja arriba: tipo de cambio, inversiones, datos del cliente, ayuda general.',
  },
];

export const FOLDER_IDS = FOLDERS.map((folder) => folder.id);
export const DEFAULT_FOLDER = 'otros';

// Sinónimos frecuentes del modelo. No se traducen a la UI; solo redirigen a la
// carpeta correcta cuando el LLM usa otra palabra para la misma idea.
const ALIASES = {
  transferencias: 'transacciones',
  transferencia: 'transacciones',
  pagos: 'transacciones',
  operaciones: 'transacciones',
  promocion: 'promociones',
  ofertas: 'promociones',
  creditos: 'promociones',
  credito: 'promociones',
  movimiento: 'movimientos',
  cuentas: 'movimientos',
  saldos: 'movimientos',
  estado_de_cuenta: 'movimientos',
  gasto: 'gastos',
  presupuesto: 'gastos',
  consumo: 'gastos',
  otro: 'otros',
  general: 'otros',
};

// Quita acentos y normaliza separadores para que 'ANÁLISIS DE GASTOS',
// 'gastos' y 'Gastos' lleguen todos a la misma llave.
const slug = (value) =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');

export function normalizeFolder(value) {
  if (value == null) return DEFAULT_FOLDER;
  const key = slug(value);
  if (FOLDER_IDS.includes(key)) return key;
  if (ALIASES[key]) return ALIASES[key];
  return DEFAULT_FOLDER;
}

export function folderLabel(id) {
  return FOLDERS.find((folder) => folder.id === id)?.label ?? id;
}

// Bloque que se inserta tal cual en el prompt del agente.
export function foldersPromptSection() {
  return [
    'CARPETAS DEL HISTORIAL (elige EXACTAMENTE una por respuesta, con su id en minúsculas):',
    ...FOLDERS.map((folder) => `- "${folder.id}" — ${folder.hint}`),
  ].join('\n');
}

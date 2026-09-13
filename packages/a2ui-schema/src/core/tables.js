// Columnas y filas de una tabla: lo que manda el modelo vs. lo que pintan los renderers.
//
// Table quiere filas como arreglos (una celda por columna) y DataTable filas
// como objetos con la `key` de cada columna. El modelo mezcla las dos formas
// todo el tiempo, y con razón: los datos de las herramientas van al dataModel
// tal cual (objetos), así que una `Table` con rows:{path:"/transactions"} recibe
// objetos, y una `DataTable` con columns ["Fecha","Concepto"] recibe llaves en
// inglés. Sin traducir, el síntoma era una tabla de "[object Object]" o de
// celdas vacías — justo en los movimientos recientes.
//
// Aquí se resuelve una sola vez para las tres plataformas: cada columna queda
// con la llave real con la que la fila trae el dato, su etiqueta visible y, si
// el modelo no lo dijo, el formato que le corresponde por lo que representa.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (value === undefined || value === null ? '' : String(value));
const list = (value) => (Array.isArray(value) ? value : []);

// Sin String.normalize('NFD'): Hermes no garantiza la descomposición, así que
// los acentos se quitan con una tabla corta (igual que en el DataTable móvil).
const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
// 'Fecha límite' → 'fechalimite'; 'payment_due' → 'paymentdue'.
const norm = (value) =>
  asText(value).toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c).replace(/[^a-z0-9]+/g, '');

// Encabezado (como lo escribe el modelo) → llaves con las que llegan los datos
// del banco. Solo se consulta cuando el encabezado no es ya una llave de la fila.
const HEADER_KEYS = {
  fecha: ['date', 'day', 'paymentdue', 'duedate', 'nextdate', 'month'],
  dia: ['day', 'date', 'dayofmonth'],
  fechalimite: ['paymentdue', 'duedate', 'limitdate', 'date'],
  vencimiento: ['paymentdue', 'duedate', 'maturitydate', 'date'],
  proximafecha: ['nextdate', 'nextpaymentdate', 'date'],
  mes: ['month', 'period', 'date'],
  concepto: ['description', 'concept', 'detail', 'label', 'merchant', 'name', 'title'],
  descripcion: ['description', 'detail', 'concept', 'label', 'name', 'title'],
  detalle: ['description', 'detail', 'label', 'name'],
  movimiento: ['description', 'label', 'name'],
  evento: ['label', 'summary', 'title', 'description'],
  monto: ['amount', 'total', 'value', 'balance'],
  importe: ['amount', 'total', 'value'],
  cantidad: ['amount', 'quantity', 'total', 'value'],
  total: ['total', 'amount', 'value'],
  pagominimo: ['minimumpayment', 'minpayment'],
  pago: ['payment', 'amount', 'minimumpayment'],
  abono: ['payment', 'principal', 'amount'],
  interes: ['interest', 'interestpaid'],
  saldo: ['balance', 'availablebalance', 'remaining'],
  categoria: ['category', 'group'],
  rubro: ['category', 'group'],
  cuenta: ['accountname', 'account', 'name', 'accountid'],
  tarjeta: ['name', 'cardname', 'card', 'accountname', 'accountid'],
  banco: ['bank', 'bankname'],
  beneficiario: ['name', 'beneficiary', 'alias'],
  tipo: ['type', 'kind'],
  estado: ['status', 'state'],
  estatus: ['status', 'state'],
  plazo: ['term', 'months', 'termmonths'],
  tasa: ['rate', 'interestrate', 'annualrate'],
  rendimiento: ['yield', 'return', 'performance', 'rate'],
  variacion: ['delta', 'change', 'deltapct'],
  numero: ['number', 'accountnumber'],
  clabe: ['clabe'],
};

// Llave → etiqueta en español, para cuando el modelo manda filas sin columnas.
const KEY_LABELS = {
  date: 'Fecha', day: 'Día', month: 'Mes', paymentdue: 'Fecha límite', duedate: 'Fecha límite',
  nextdate: 'Próxima fecha', description: 'Concepto', label: 'Concepto', detail: 'Detalle',
  name: 'Nombre', merchant: 'Comercio', category: 'Categoría', amount: 'Monto', total: 'Total',
  value: 'Valor', balance: 'Saldo', availablebalance: 'Disponible', payment: 'Pago',
  minimumpayment: 'Pago mínimo', principal: 'Abono a capital', interest: 'Interés',
  type: 'Tipo', status: 'Estado', bank: 'Banco', clabe: 'CLABE', number: 'Número',
  rate: 'Tasa', interestrate: 'Tasa', term: 'Plazo', months: 'Plazo', yield: 'Rendimiento',
  delta: 'Variación', deltapct: 'Variación', accountname: 'Cuenta',
};

// Formato por lo que la columna representa, cuando el modelo no lo dijo.
const FORMAT_HINTS = [
  { format: 'date', keys: ['date', 'day', 'paymentdue', 'duedate', 'nextdate', 'fecha', 'fechalimite', 'vencimiento'] },
  { format: 'percent', keys: ['rate', 'interestrate', 'annualrate', 'tasa', 'deltapct', 'percent', 'porcentaje', 'rendimiento', 'yield'] },
  { format: 'currency', keys: ['amount', 'balance', 'availablebalance', 'payment', 'minimumpayment', 'principal', 'interest', 'total', 'monto', 'importe', 'saldo', 'pago', 'pagominimo', 'creditlimit', 'limite'] },
];

const inferFormat = (key, label) => {
  const candidates = [norm(key), norm(label)];
  for (const hint of FORMAT_HINTS) {
    if (candidates.some((candidate) => candidate && hint.keys.includes(candidate))) return hint.format;
  }
  return undefined;
};

// Las llaves técnicas no son una columna: nadie quiere ver TX-1041 ni ACC-001
// como primera celda de sus movimientos.
const isTechnicalKey = (key) => {
  const value = norm(key);
  return value === 'id' || value.endsWith('id');
};

// Columnas de una tabla resueltas contra sus filas.
//
// Devuelve [{key, label, format, align}]: `key` es con la que se lee la celda de
// una fila-objeto y `label` lo que se pinta en el encabezado. Si no vienen
// columnas, se deducen de la primera fila-objeto.
export function resolveTableColumns(columns, rows) {
  const raw = list(columns)
    .map((column) => (isObject(column)
      ? { hint: column.key ?? column.field, label: asText(column.label ?? column.key ?? column.field ?? ''), format: column.format, align: column.align }
      : { hint: undefined, label: asText(column), format: undefined, align: undefined }))
    .filter((column) => column.label !== '' || column.hint !== undefined);

  const sample = list(rows).find(isObject);
  const sampleKeys = sample ? Object.keys(sample) : [];
  const byNorm = new Map(sampleKeys.map((key) => [norm(key), key]));

  // Sin columnas: las dicta la fila. Cada llave se queda con su etiqueta en español.
  if (!raw.length) {
    return sampleKeys
      .filter((key) => !isTechnicalKey(key))
      .map((key) => {
        const label = KEY_LABELS[norm(key)] ?? key;
        return { key, label, format: inferFormat(key, label), align: undefined };
      });
  }

  // Con filas-objeto cada columna busca su llave: la que el modelo declaró, el
  // encabezado tal cual o un alias del dominio.
  const byName = raw.map((column) => {
    const direct = [column.hint, column.label].map(norm).find((candidate) => candidate && byNorm.has(candidate));
    if (direct) return byNorm.get(direct);
    const alias = [norm(column.hint), norm(column.label)]
      .flatMap((candidate) => HEADER_KEYS[candidate] ?? [])
      .find((candidate) => byNorm.has(candidate));
    return alias ? byNorm.get(alias) : null;
  });

  // Si NINGUNA columna se reconoció por nombre y hay tantas llaves como
  // columnas, la tabla es posicional (llaves que el dominio no conoce, en el
  // orden de los encabezados). Cuando algunas sí se reconocieron, las que no
  // quedan vacías: una celda en blanco se entiende, una celda con el dato de
  // otra columna engaña.
  const usable = sampleKeys.filter((key) => !isTechnicalKey(key));
  const positional = byName.some(Boolean)
    ? null
    : usable.length === raw.length ? usable : sampleKeys.length === raw.length ? sampleKeys : null;

  return raw.map((column, index) => {
    const key = byName[index] ?? (positional ? positional[index] : asText(column.hint ?? column.label ?? index));
    const label = column.label || KEY_LABELS[norm(key)] || asText(key);
    return { key, label, format: column.format ?? inferFormat(key, label), align: column.align };
  });
}

// Una fila con una celda por columna. Los arreglos se respetan tal cual (ya
// vienen en el orden de las columnas); los objetos se leen por la llave resuelta.
export function tableRow(row, columns) {
  if (Array.isArray(row)) return row;
  if (isObject(row)) return list(columns).map((column) => row[column.key] ?? '');
  return [row];
}

// Props de una `Table` en su forma canónica: columnas como texto y filas como
// arreglos, que es lo único que ese componente sabe pintar.
export function normalizeTableProps({ columns, rows } = {}) {
  const resolved = resolveTableColumns(columns, rows);
  return {
    columns: resolved.map((column) => column.label),
    rows: list(rows).map((row) => (isObject(row) ? tableRow(row, resolved) : row)),
  };
}

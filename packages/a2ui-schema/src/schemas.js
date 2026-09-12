// Esquemas zod de cada componente de Norte UI Spec v1.
// Son tolerantes a propósito: el modelo a veces manda números donde va texto,
// enums fuera de catálogo o nombres alternos de campos. En vez de rechazar el
// componente, cada esquema lo lleva a su forma canónica (la que renderizan web
// y mobile) y conserva cualquier campo extra que no conozca.

import { z } from 'zod';

export const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut'];
export const ALERT_LEVELS = ['info', 'success', 'warning', 'error'];
export const ACCOUNT_KINDS = ['checking', 'savings', 'credit'];
export const TRENDS = ['up', 'down', 'neutral'];
export const INPUT_TYPES = ['text', 'number', 'select'];

const text = z.union([z.string(), z.number(), z.boolean()]).transform(String);
const optionalText = text.optional().catch(undefined);
const requiredText = text.catch('');
// Número tolerante: acepta "1200" pero no booleanos ni null (caen a 0).
const number = z.union([z.number(), z.string()]).pipe(z.coerce.number()).catch(0);
const enumOr = (values, fallback) => z.enum(values).catch(fallback);

// Lista de objetos: descarta entradas que no son objetos y, si no es lista, queda vacía.
const objectList = (schema) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []),
    z.array(schema),
  );

// Lista de textos: descarta solo los elementos inválidos (null, objetos) en vez
// de perder toda la lista, para que un label roto no borre los demás.
const textList = z
  .preprocess(
    (value) => (Array.isArray(value) ? value.filter((v) => v != null && typeof v !== 'object') : []),
    z.array(text),
  )
  .catch([]);

export const HeaderSchema = z
  .object({ type: z.literal('header'), title: requiredText, subtitle: optionalText, badge: optionalText })
  .passthrough();

const KpiItemSchema = z
  .object({ label: requiredText, value: requiredText, delta: optionalText, trend: enumOr(TRENDS, 'neutral'), icon: optionalText })
  .passthrough();

export const KpiGridSchema = z
  .object({ type: z.literal('kpi_grid'), items: objectList(KpiItemSchema) })
  .passthrough();

const AccountCardSchema = z
  .object({
    name: text.catch('Cuenta'),
    number: optionalText,
    // Número → el renderer lo formatea como moneda; string → se muestra tal cual.
    balance: z.union([z.number(), z.string()]).catch(''),
    currency: optionalText,
    kind: enumOr(ACCOUNT_KINDS, 'checking'),
    extra: optionalText,
  })
  .passthrough();

export const BalanceCardsSchema = z
  .object({ type: z.literal('balance_cards'), accounts: objectList(AccountCardSchema) })
  .passthrough();

const DatasetSchema = z
  .object({
    label: optionalText,
    data: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(number)),
  })
  .passthrough();

export const ChartSchema = z
  .object({
    type: z.literal('chart'),
    chartType: enumOr(CHART_TYPES, 'bar'),
    title: optionalText,
    labels: textList,
    datasets: objectList(DatasetSchema),
  })
  .passthrough();

export const TableSchema = z
  .object({
    type: z.literal('table'),
    title: optionalText,
    columns: textList,
    rows: z.array(textList).catch([]),
  })
  .passthrough();

const TransactionSchema = z
  .object({ date: optionalText, description: requiredText, category: optionalText, amount: number })
  .passthrough();

export const TransactionListSchema = z
  .object({ type: z.literal('transaction_list'), title: optionalText, items: objectList(TransactionSchema) })
  .passthrough();

// Opción de select: {value,label} o un string simple.
const OptionSchema = z.preprocess(
  (o) => (o && typeof o === 'object' ? o : { value: String(o), label: String(o) }),
  z
    .object({ value: text.catch(''), label: optionalText })
    .passthrough()
    .transform((o) => ({ ...o, label: o.label ?? o.value })),
);

// Campo de formulario: acepta `type` como alias de `inputType` y deduce
// `select` cuando hay opciones.
const FieldSchema = z.preprocess(
  (f) => {
    if (!f || typeof f !== 'object') return f;
    const { type, ...rest } = f;
    const options = Array.isArray(rest.options) ? rest.options : undefined;
    const inputType = rest.inputType ?? type ?? (options?.length ? 'select' : 'text');
    return { ...rest, inputType, options };
  },
  z
    .object({
      name: requiredText,
      label: optionalText,
      inputType: enumOr(INPUT_TYPES, 'text'),
      options: z.array(OptionSchema).optional().catch(undefined),
      placeholder: optionalText,
      value: optionalText,
    })
    .passthrough(),
);

// Formulario: acepta `inputs` como alias de `fields`.
export const FormSchema = z.preprocess(
  (c) => {
    if (!c || typeof c !== 'object') return c;
    const { inputs, ...rest } = c;
    return { ...rest, fields: rest.fields ?? inputs };
  },
  z
    .object({
      type: z.literal('form'),
      title: optionalText,
      description: optionalText,
      action: text.catch('accion'),
      submitLabel: optionalText,
      fields: objectList(FieldSchema),
    })
    .passthrough(),
);

export const AlertSchema = z
  .object({ type: z.literal('alert'), level: enumOr(ALERT_LEVELS, 'info'), title: optionalText, text: requiredText })
  .passthrough();

export const ProgressSchema = z
  .object({
    type: z.literal('progress'),
    label: optionalText,
    value: number.transform((v) => Math.max(0, Math.min(100, v))),
    caption: optionalText,
  })
  .passthrough();

// Texto: acepta `text` como alias de `markdown`.
export const TextSchema = z.preprocess(
  (c) => {
    if (!c || typeof c !== 'object') return c;
    const { text: plain, ...rest } = c;
    return { ...rest, markdown: rest.markdown ?? plain };
  },
  z.object({ type: z.literal('text'), markdown: requiredText }).passthrough(),
);

export const componentSchemas = {
  header: HeaderSchema,
  kpi_grid: KpiGridSchema,
  balance_cards: BalanceCardsSchema,
  chart: ChartSchema,
  table: TableSchema,
  transaction_list: TransactionListSchema,
  form: FormSchema,
  alert: AlertSchema,
  progress: ProgressSchema,
  text: TextSchema,
};

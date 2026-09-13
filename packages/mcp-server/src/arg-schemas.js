// Esquemas de argumentos tolerantes al tipo, para las tools de server.js.
//
// Los modelos mandan de forma intermitente los números como texto ("1" en vez
// de 1) y los booleanos como "true". Con z.number() eso era un error -32602 de
// validación del protocolo, que el agente recibía como texto de error y pintaba
// como "el servicio no respondió" aunque los datos estuvieran ahí y la tool
// fuera correcta.
//
// Se convierte solo lo que es inequívocamente un número o un booleano; "muchos"
// o "sí" siguen siendo un error de validación, porque adivinar ahí sería peor
// que fallar. El esquema que ve el modelo no cambia (se le sigue pidiendo
// number/boolean en el JSON Schema): esto solo perdona el desliz del tipo.

import { z } from 'zod';

export const numberArg = () =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : value,
    z.number(),
  );

export const booleanArg = () =>
  z.preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean());

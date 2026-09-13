// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.
// Núcleo de Norte A2UI, sin dependencias.
//
// Esta carpeta se consume desde tres lugares distintos con el mismo código:
//   - @norte/api (Node) via `@norte/a2ui-schema`
//   - la web, servida tal cual en /a2ui/*.js como módulos ES
//   - la app móvil, como copia sincronizada en apps/mobile/src/a2ui/core
//
// Por eso aquí no hay zod ni nada de npm: lo que necesite validación fuerte
// vive en ../messages.js (solo servidor).

export * from './pointer.js';
export * from './format.js';
export * from './functions.js';
export * from './binding.js';
export * from './catalog-v2.js';
export * from './flatten.js';
export * from './degrade.js';
export * from './compat.js';
export * from './runtime.js';

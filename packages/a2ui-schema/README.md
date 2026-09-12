# @norte/a2ui-schema (pendiente)

Contrato **Norte UI Spec v1** (nuestro equivalente de A2UI) como esquemas zod compartidos por
`@norte/api` (validar la salida del LLM), `@norte/web` y `@norte/mobile` (renderizar).

Hoy el contrato vive duplicado en el `SYSTEM_PROMPT` de `apps/api/src/agent.js` y en
`apps/web/public/renderer.js`. Extraerlo aquí es la primera tarea de este paquete.

Ver [README raíz](../../README.md), sección "Protocolo A2UI".

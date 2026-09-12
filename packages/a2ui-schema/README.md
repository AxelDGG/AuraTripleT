# @norte/a2ui-schema

Contrato **Norte UI Spec v1** (nuestro equivalente de A2UI): la única fuente de verdad de qué
componentes puede emitir el agente y con qué campos.

- `src/catalog.js` — los 10 tipos con su ejemplo y descripción. `componentsPromptSection()` genera el
  bloque "COMPONENTES DE UI DISPONIBLES" que usa el `SYSTEM_PROMPT` del agente.
- `src/schemas.js` — esquemas zod tolerantes: acotan enums (`chartType`, `level`, `kind`, `trend`,
  `inputType`), coaccionan números, aceptan alias del modelo (`inputs`→`fields`, `type`→`inputType`,
  `text`→`markdown`, opciones como string) y conservan campos desconocidos.
- `src/index.js` — `normalizeUiSpec({message, ui})` y `normalizeComponent(c)`: nunca lanzan; lo que
  no se entiende se descarta.

Lo usa `@norte/api` para construir el prompt y normalizar la salida del LLM antes de emitir el evento
`ui`. Web y mobile renderizan la forma canónica que sale de aquí.

```bash
npm test -w @norte/a2ui-schema
```

# @norte/a2ui-schema

El contrato de interfaz entre el agente y los clientes: **Norte A2UI v2**, nuestro perfil del protocolo
abierto [A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/) con catálogo propio, más el Norte UI
Spec v1 (legado) que sigue vivo para el historial viejo y como proyección de compatibilidad. Detalle
del protocolo en [`docs/A2UI.md`](../../docs/A2UI.md).

## `src/core/` — núcleo sin dependencias

Es el mismo código en tres lugares: la API lo importa, la web lo carga como módulos ES (`/a2ui/*.js`)
y la app móvil lleva una copia (`npm run sync:a2ui`; `tests/sync.test.js` falla si difiere).

| Archivo | Qué hace |
|---|---|
| `pointer.js` | JSON Pointer RFC 6901 inmutable: `getAt`, `setAt` (null borra), `removeAt`, `joinPointer`, `pointersOverlap` |
| `binding.js` | `resolveDynamic` (literal · `{path}` · `{call,args}` · comodín `*`), `resolveProps`, anotación de dependencias |
| `functions.js` · `format.js` | Renderer functions (formato, aritmética, colecciones, lógica, amortización) y formato es-MX sin `Intl` |
| `catalog-v2.js` | Los 24 componentes por capa, alias del modelo, descriptor público y sección compacta del prompt |
| `flatten.js` | Árbol anidado del modelo → lista de adyacencia con `root`; orden BFS; árbol de vuelta |
| `compat.js` | v1 → v2 (`liftV1Component`, `surfaceFromV1`) y v2 → v1 (`toV1Components`, resolviendo bindings) |
| `runtime.js` | `createSurfaceStore`: aplica `createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface`, resuelve, cambios locales, `dispatchAction`, acciones locales |

## `src/messages.js` — solo servidor (zod)

Esquemas de los cuatro mensajes (`makeMessage`, `parseMessage`), `UserActionSchema` /
`parseUserAction` (cliente → agente), `ClientCapabilitiesSchema` y `normalizeAgentReply`: lleva la
respuesta del modelo a una superficie (aplanada, con enums acotados y proyección v1) o a un patch
sobre la superficie activa.

## v1 (legado)

- `src/catalog.js` — catálogo de gráficas (compartido con v2) y el catálogo v1 de 10 tipos.
- `src/schemas.js` — esquemas zod tolerantes por componente; v2 los reutiliza para normalizar la
  parte literal de `Header`, `Chart`, `Kpi`, `AccountCard`, etc.
- `normalizeUiSpec({message, ui})` sigue disponible.

```bash
npm test -w @norte/a2ui-schema   # core · messages · schema v1 · sincronía con mobile
```

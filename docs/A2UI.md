# Norte A2UI v2 · el protocolo de interfaz del agente

> Cómo viaja la interfaz que genera Norte AI desde el agente hasta la pantalla, y cómo lo que la
> persona toca regresa al agente. Es nuestro perfil del protocolo abierto
> [A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/) (Agent-to-User Interface) con un catálogo
> de componentes propio, que es exactamente lo que el reto pide: *A2UI o un protocolo equivalente*
> con *componentes diseñados y programados por el equipo*.

| Sección | Para qué sirve |
|---|---|
| [1. Por qué A2UI](#1-por-qué-a2ui-y-no-solo-un-json) | Qué gana el producto con un protocolo de verdad |
| [2. Mensajes](#2-mensajes) | Los cuatro mensajes agente → cliente y el evento cliente → agente |
| [3. Superficies y componentes](#3-superficies-y-componentes) | Lista de adyacencia, catálogo, cómo lo escribe el modelo |
| [4. Modelo de datos y bindings](#4-modelo-de-datos-y-bindings) | `path`, `call`, funciones, comodines, listas |
| [5. Acciones](#5-acciones) | Eventos tipados, autorización en código, acciones locales |
| [6. Streaming](#6-streaming) | Esqueleto, chunks, patches |
| [7. Runtime compartido](#7-runtime-compartido) | Un núcleo, tres consumidores (API, web, mobile) |
| [8. Negociación de catálogo](#8-negociación-de-catálogo) | Lo que cada cliente anuncia que sabe pintar |
| [9. Conformidad](#9-matriz-de-conformidad-con-a2ui-v10) | Qué implementamos de la spec, qué no y por qué |
| [10. Dónde vive cada cosa](#10-dónde-vive-cada-cosa) | Mapa de archivos |

---

## 1. Por qué A2UI y no solo un JSON

Norte UI Spec v1 era un arreglo plano de componentes que el modelo emitía completo al final del turno y
el cliente pintaba de golpe. Servía, pero tenía cuatro límites que el reto castiga:

| Límite de v1 | Qué cambia en v2 |
|---|---|
| La pantalla aparecía completa después de 6-10 s | Sale un **esqueleto** con el primer tool call y la interfaz llega **por partes** |
| Cada cambio (otro plazo, otro monto) exigía otra vuelta al LLM | Los valores viven en un **dataModel**; los controles escriben ahí y lo derivado se **recalcula en el cliente** con funciones puras, sin LLM |
| Las acciones eran texto (`[form:x] a=1, b=2`) que el modelo reparseaba | **Eventos tipados** con contexto resuelto, validados con zod, y la autorización de dinero la decide el servidor |
| El agente no podía acomodar la pantalla | **Layout** (`Grid`, `Row`, `Section`, `Tabs`, `List`) y componentes finos (`Kpi`, `AccountCard`) en vez de bloques cerrados |

Todo v1 sigue funcionando: el historial viejo se eleva a superficie al leerse (`surfaceFromV1`) y cada
superficie lleva una proyección v1 (`toV1Components`) para clientes que no hayan migrado.

## 2. Mensajes

Los mensajes viajan dentro del stream SSE de `POST /api/chat` y `POST /api/action` como eventos
`{"type":"a2ui","message":<envelope>}`. El envelope es el de la spec: `version` + exactamente una
llave con el tipo de mensaje.

```json
{"version":"v1.0","createSurface":{"surfaceId":"s_01","catalogId":"urn:norte:a2ui:catalog:banorte:v2","sendDataModel":true,"components":[…],"dataModel":{…}}}
{"version":"v1.0","updateComponents":{"surfaceId":"s_01","components":[…]}}
{"version":"v1.0","updateDataModel":{"surfaceId":"s_01","path":"/plan/months","value":24}}
{"version":"v1.0","deleteSurface":{"surfaceId":"s_01"}}
```

| Mensaje | Cuándo lo manda el agente |
|---|---|
| `createSurface` | Al primer tool call (esqueleto) o al empezar a transmitir una superficie sin herramientas |
| `updateDataModel` | Con el modelo completo (`path: ""`) antes de los componentes, y con una ruta puntual en un patch |
| `updateComponents` | Los componentes reales, en chunks de la raíz hacia abajo (BFS) |
| `deleteSurface` | Cuando el esqueleto sobra porque el turno terminó siendo un patch |

Del cliente al agente viaja **una acción** (`POST /api/action`), validada por `UserActionSchema`:

```json
{"surfaceId":"s_01","event":{"name":"confirm_restructure","context":{"accountId":"ACC-003","months":24}},"dataModel":{…}}
```

`sendDataModel: true` en la superficie hace que el cliente adjunte el dataModel completo: es,
literalmente, "lo que la persona toca regresa al modelo como contexto".

El evento `ui` que cierra cada turno resume el resultado para el historial y la voz:
`{message, title, folder, surfaceId, surface, ui}` (o `{patch: true, surfaceId, updates, message}`).

## 3. Superficies y componentes

Una superficie es una lista **plana** de componentes con `id`; los contenedores referencian a sus
hijos por id (lista de adyacencia) y siempre hay un componente `root`:

```json
{"id":"root","component":"Stack","children":["h1","grid"]}
{"id":"h1","component":"Header","title":"Reestructura tu saldo"}
{"id":"grid","component":"Grid","columns":2,"children":["k1","k2"]}
```

**El modelo no escribe eso.** Los LLM generan mucho mejor JSON anidado que grafos con identificadores,
así que el modelo emite `children: [{…}, {…}]` y el servidor aplana (`flattenTree`): asigna ids,
renombra duplicados, acepta `type` en vez de `component`, nombres en minúsculas o alias
(`Column`→`Stack`, `Metric`→`Kpi`), y eleva componentes v1 mezclados. Lo que no reconoce se descarta.

### Catálogo `urn:norte:a2ui:catalog:banorte:v2`

Publicado en `GET /api/a2ui/catalog`. Fuente única: `packages/a2ui-schema/src/core/catalog-v2.js`.

| Capa | Componentes |
|---|---|
| **Layout** | `Stack`, `Row`, `Grid`, `Card`, `Section`, `Tabs`, `Divider`, `List` |
| **Dominio** (propios, con los 16 tipos de gráfica de v1) | `Header`, `Kpi`, `AccountCard`, `Chart`, `Table`, `TransactionList`, `Alert`, `Progress`, `Text` |
| **Controles** (ligados al dataModel) | `Slider`, `Select`, `ChoiceChips`, `TextField`, `Toggle` |
| **Acciones** | `Button`, `Form` |
| Interno del cliente | `Skeleton` (no se le ofrece al modelo) |

La sección del prompt se genera del catálogo (`componentsPromptSectionV2`) como **firmas** compactas
más un ejemplo completo: el orquestador (Groq on-demand) tiene 8 000 tokens por minuto contando tools
y resultados, así que el prompt entero pesa ~2 800 tokens.

## 4. Modelo de datos y bindings

Cada superficie tiene un `dataModel` (JSON) y toda propiedad de componente puede ser:

| Forma | Ejemplo | Qué hace |
|---|---|---|
| Literal | `"label": "Pago mensual"` | Se usa tal cual |
| Ruta | `"value": {"path": "/plan/months"}` | JSON Pointer (RFC 6901) al dataModel |
| Ruta relativa | `"markdown": {"path": "description"}` | Dentro de un `List`, relativa al elemento actual |
| Comodín | `"labels": {"path": "/gastos/*/categoria"}` | Recorre una lista (extensión; `[*]` también) |
| Función | `"value": {"call": "currency", "args": {"v": {"call": "amortize", "args": {…}}}}` | Derivado; los args aceptan bindings |

Las funciones (`RENDERER_FUNCTIONS`) son una tabla cerrada de funciones puras: formato (`currency`,
`percent`, `compact`, `date`, `template`), aritmética (`add`, `pct`, `sum`, `round`…), colecciones
(`pluck`, `lookup`, `count`…), lógica (`if`, `eq`…) y finanzas (`amortize`, `totalInterest`,
`schedule`, `scheduleLabels`, `effectiveAnnual`). Nunca se ejecuta código que venga del modelo: el
modelo elige un nombre de la tabla. El formateo se hace a mano (sin `Intl`) para que el resultado sea
idéntico en Node, en el navegador y en Hermes.

Un control escribe en su `value.path`; el runtime avisa qué ruta cambió y solo los componentes que la
leyeron (las dependencias se anotan al resolver) se vuelven a pintar. Así un `Slider` de plazo mueve
tres `Kpi` y una `Chart` de amortización en el mismo frame, sin ninguna llamada de red.

## 5. Acciones

Un `Button` (o un `Form` al enviarse) lleva `action`:

```json
{"event": {"name": "confirm_restructure", "context": {"accountId": "ACC-003", "months": {"path": "/plan/months"}}}}
{"functionCall": {"call": "increment", "args": {"path": "/plan/months", "by": 6, "max": 36}}}
```

- `event` → el cliente resuelve el contexto contra el dataModel del momento y lo manda a
  `POST /api/action`. El servidor lo describe al modelo como `[action:confirm_restructure] {…}`.
- `functionCall` → acción **local** (`setData`, `toggle`, `increment`): cambia el dataModel sin agente.

**La autorización vive en código** (`apps/api/src/actions.js`). `transfer_funds` y
`restructure_card_debt` solo se ejecutan con `confirmed: true`, y ese valor lo fija el servidor cuando
el evento está en la lista (`confirm_transfer`, `confirm_restructure`…) **y** su contexto valida contra
el esquema zod del evento. Un evento desconocido llega al modelo como contexto, pero no autoriza nada.
El canal viejo (`[form:transfer_funds] …`) sigue aceptado.

`"confirm": true` en un `Button` hace que el cliente pida un segundo toque antes de mandar el evento.

## 6. Streaming

```
usuario ──► POST /api/chat ──► agente
   status "Analizando…"
   a2ui createSurface (esqueleto: Header + siluetas según las tools pedidas)   ← ~1 s
   tool_call / tool_result ×N
   a2ui updateDataModel path:""  (modelo completo)
   a2ui updateComponents (root + 2)      ┐
   a2ui updateComponents (3)             │  110 ms entre chunks (A2UI_STREAM_DELAY_MS)
   a2ui updateComponents (…)             ┘
   ui {title, message, folder, surface, ui}
   history {entry}
   done
```

El esqueleto se deriva de qué herramientas pidió el modelo (`TOOL_SKELETON`): `get_spending_by_category`
→ silueta de gráfica, `get_accounts` → tarjetas, `get_transactions` → lista, etc. Un hijo referenciado
que aún no llegó deja un hueco en el cliente y se rellena solo con el chunk siguiente.

**Patch.** Cada petición lleva la superficie activa (`{surfaceId, title, dataModel}`). Si la persona
solo cambia un valor de la misma pantalla ("¿y a 6 meses?"), el modelo responde
`{"surfaceId": "…", "updates": [{"path": "/plan/months", "value": 6}]}` y el servidor emite
`updateDataModel` puntuales: la pantalla se reconfigura sin reconstruirse ni volver a archivarse.
Un patch a una superficie que no es la activa se trata como superficie nueva.

## 7. Runtime compartido

`packages/a2ui-schema/src/core/` no tiene dependencias y se consume tres veces con el mismo código:

| Consumidor | Cómo |
|---|---|
| `@norte/api` | `import … from '@norte/a2ui-schema'` (aplanado, proyección v1, streaming) |
| Web | Servido tal cual como módulos ES en `/a2ui/*.js`; `js/a2ui-web.js` pone el registro DOM encima |
| Mobile | Copia sincronizada en `apps/mobile/src/a2ui/core` (`npm run sync:a2ui`); un test falla si difiere |

| Archivo | Responsabilidad |
|---|---|
| `pointer.js` | JSON Pointer inmutable (get/set/remove, prefijos) |
| `binding.js` | `resolveDynamic`, `resolveProps`, deps, comodines |
| `functions.js` · `format.js` | Renderer functions y formato es-MX sin Intl |
| `catalog-v2.js` | Catálogo, alias, descriptor y sección del prompt |
| `flatten.js` | Árbol del modelo → adyacencia; orden BFS; árbol de vuelta |
| `compat.js` | v1 → v2 (`liftV1Component`, `surfaceFromV1`) y v2 → v1 (`toV1Components`) |
| `runtime.js` | `createSurfaceStore`: aplica mensajes, resuelve, cambios locales, acciones |
| `../messages.js` (solo servidor) | Esquemas zod de los mensajes, `normalizeAgentReply`, `parseUserAction` |

## 8. Negociación de catálogo

Cada petición al agente lleva `client: {platform, catalogId, components: [...]}` con lo que ese
cliente sabe pintar (`SUPPORTED_COMPONENTS` de cada renderer). El prompt se restringe a esa lista:
un cliente que solo pinte `Stack`, `Kpi` y `Text` recibe superficies con solo eso. El widget de Android
hoy no habla con el agente (abre deep links); el mecanismo ya está para cuando lo haga.

## 9. Matriz de conformidad con A2UI v1.0

| Elemento de la spec | Estado | Nota |
|---|---|---|
| Envelope `{version, <mensaje>}` | ✅ | `makeMessage` / `parseMessage` validan con zod |
| `createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface` | ✅ | Los cuatro, con `surfaceId`, `catalogId`, `sendDataModel` |
| Componentes con `id` + `component` + props, lista de adyacencia, `root` obligatorio | ✅ | Aplanado en el servidor |
| `children` como lista de ids o plantilla `{path, componentId}` | ✅ | `List` y rutas relativas |
| Valores dinámicos: literal / `{path}` / `{call, args}` | ✅ | Más comodín `*` como extensión |
| JSON Pointer RFC 6901; `null` borra; `path` vacío reemplaza el modelo | ✅ | `pointer.js` |
| Acciones `event` con `context` bindeado y `functionCall` local | ✅ | Tabla cerrada de funciones locales |
| `sendDataModel` adjunta el modelo en cada acción | ✅ | |
| Negociación por `catalogId` / capacidades del cliente | ✅ | `client.components` restringe el prompt |
| Catálogo básico de A2UI (`Text`, `Button`, `Column`…) | ➖ | Catálogo propio (regla 1 del reto); los nombres del básico se aceptan como alias |
| `callRendererFunction` / `agentFunctionResponse` bidireccionales | ✖ | Sin caso de uso en el flujo; no puntúa |
| Transportes A2A / AG-UI | ✖ | Transporte propio: SSE (la spec lo lista como propuesto) |
| Renderers oficiales (Lit / Angular / Flutter) | ✖ | Renderers propios web (DOM) y React Native |

## 10. Dónde vive cada cosa

```
packages/a2ui-schema/src/core/     núcleo sin dependencias (§7)
packages/a2ui-schema/src/messages.js  mensajes zod, normalizeAgentReply, parseUserAction
apps/api/src/agent.js              prompt v2, esqueleto, chunks, patch
apps/api/src/a2ui-stream.js        cómo se transmite una superficie
apps/api/src/actions.js            eventos tipados y autorización de herramientas con dinero
apps/api/src/routes/chat.js        POST /api/chat · POST /api/action
apps/api/src/routes/a2ui.js        GET /api/a2ui/catalog
apps/web/public/js/a2ui-web.js     renderer DOM reactivo + registro de 24 componentes
apps/web/public/css/a2ui.css       layout, controles, botones, esqueleto
apps/mobile/src/a2ui/              A2UIRenderer (React), inputs nativos, core sincronizado
scripts/sync-a2ui-core.js          copia/verifica el núcleo en la app móvil
```

Pruebas: `packages/a2ui-schema/tests/{core,messages,sync}.test.js`, `apps/api/tests/{agent,routes,ui-spec}.test.js`,
`packages/mcp-server/tests/tools.test.js` (reestructura).

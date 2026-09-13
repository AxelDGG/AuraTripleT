> **DOMINIO / URL:** https://140-82-25-228.sslip.io/login

# Norte AI · HackMTY × Banorte

> **Interfaces que la IA construye en tiempo real.** Norte AI es el asistente de Banorte que no
> responde con un muro de texto: entiende qué quieres lograr, consulta tus datos y **arma la pantalla**
> (simulador, tabla, formulario, gráfica) que resuelve tu problema financiero. Lo que tocas en esa
> pantalla regresa al agente y la experiencia se vuelve a diseñar.

Equipo **AuraTripleT** · Reto Banorte × Tec de Monterrey · Retos MLH: Gemini API, ElevenLabs,
Snowflake, Tiger Data y Vultr.

| Sección | Para qué sirve |
|---|---|
| [1. La idea](#1-la-idea) | Qué estamos construyendo y por qué |
| [2. El reto Banorte](#2-el-reto-banorte) | Lo que evalúan y lo que no es negociable |
| [3. Territorio y flujos](#3-territorio-y-flujos-objetivo) | El problema concreto que resolvemos |
| [4. Arquitectura](#4-arquitectura) | Cómo se conectan las piezas |
| [5. Norte A2UI v2](#5-protocolo-a2ui-norte-a2ui-v2) | Nuestro perfil del protocolo A2UI |
| [6. Retos MLH](#6-retos-mlh) | Qué rol tiene cada tecnología |
| [7. Mobile y widget](#7-mobile-react-native-y-widget-android) | La app y el acceso directo en Android |
| [8. Estructura del repo](#8-estructura-del-repositorio) | Dónde va cada cosa |
| [9. Reglas](#9-reglas-del-proyecto) | Cómo trabajamos |
| [10. Cómo correrlo](#10-cómo-correrlo) | Setup local |
| [11. Plan de trabajo](#11-plan-de-trabajo) | Fases y definición de hecho |
| [12. Entregables](#12-entregables-para-el-jurado) | Checklist final |

---

## 1. La idea

Hoy un asistente bancario responde con texto que la persona tiene que interpretar, muestra la misma
pantalla para cualquier intención y, para actuar, la manda a otra app. Norte AI invierte eso:

| Hoy: el asistente responde | Norte AI: el agente construye la UI |
|---|---|
| Un muro de texto que hay que interpretar | La pantalla se arma según la intención detectada |
| La misma pantalla para cualquier intención | Componentes propios: simuladores, tablas, formularios |
| Para actuar, la persona se va a otra app | Lo que la persona toca regresa al modelo como contexto |

Los tres pasos que repite cada interacción:

1. **Interpretar la intención.** El agente entiende qué quiere lograr la persona y con qué contexto llega.
2. **Generar la interfaz.** Decide qué componentes mostrar y los transmite como una especificación de UI.
3. **Ejecutar la acción.** La interacción con esa UI dispara nuevas acciones y vuelve a cambiar la experiencia.

> El LLM es el centro de la experiencia, no un chat pegado a un lado.

---

## 2. El reto Banorte

### Tres piezas no negociables

| Pieza | Qué significa | Dónde vive en el repo |
|---|---|---|
| **LLM** | Un modelo al centro: interpreta, decide y orquesta | `apps/api/src/agent.js` |
| **MCP** | Model Context Protocol para exponer al modelo datos, herramientas y acciones propias | `packages/mcp-server/` |
| **A2UI** | Agent-to-UI o un protocolo equivalente para transmitir la interfaz que genera el agente | Norte A2UI v2 (sección 5): `packages/a2ui-schema` + `apps/web/public/js/a2ui-web.js` + `apps/mobile/src/a2ui` |

### Cuatro reglas que aplican a todos los equipos

1. **Componentes propios.** No hay biblioteca de UI: el sistema de componentes que el agente invoca lo diseña y programa el equipo.
2. **Datos y APIs propios.** Sintéticos, simulados o de fuentes públicas, creados o integrados por nosotros.
3. **Al menos un flujo accionable.** La persona interactúa con la UI generada y esa interacción produce un cambio real.
4. **Libertad de stack.** Cualquier lenguaje, framework, modelo o proveedor.

### Cómo se reparten los puntos

| Criterio | Peso |
|---|---|
| Cumplimiento y utilidad para el usuario | 25% |
| Calidad y adaptabilidad de la UI generada | 20% |
| Calidad de la solución de IA | 15% |
| Arquitectura e ingeniería | 15% |
| UX y diseño | 10% |
| Innovación | 10% |
| Presentación | 5% |

Lectura para el equipo: **45%** es resolver algo útil con una UI que de verdad se adapta; **30%** es la
ingeniería (uso del LLM, del contexto, de MCP y de A2UI); la demo vale **5%** y no salva una solución
incompleta.

### Entregables del reto

| # | Entregable | Qué incluye |
|---|---|---|
| 01 | **Demo** | Corrida en vivo del flujo completo: intención, UI generada, interacción y la acción que dispara |
| 02 | **Código** | Repositorio con componentes, servidor MCP y capa A2UI, con instrucciones para correrlo |
| 03 | **Datos** | Las APIs y datasets creados por el equipo, aunque sean sintéticos |
| 04 | **Técnico** | Diagrama de arquitectura y los tradeoffs: modelo, protocolo, infraestructura |

### El consejo del jurado, adoptado como regla

> Elijan un problema pequeño y resuélvanlo completo. Un solo flujo financiero, con una UI que de verdad
> cambia y una acción que de verdad ocurre, vale más que cinco pantallas a medias.

---

## 3. Territorio y flujos objetivo

El reto permite cualquier dominio financiero. Nosotros elegimos:

- **Primario · Banca personal:** cuentas, movimientos, control de gasto.
- **Primario · Pagos:** transferencias, cobros, conciliación.
- **Secundario · Educación financiera:** un toque de diagnóstico, metas y hábitos, sin volverse el centro.

Flujos accionables propuestos. Son una propuesta del equipo y se validan antes de implementar; el
flujo 2 ya funciona en la base.

| # | Intención de la persona | UI que genera el agente | Acción real que ocurre | Estado |
|---|---|---|---|---|
| 1 | "Quiero pagar menos intereses de mi tarjeta" | Plan de reestructura: KPIs derivados, slider de plazo (recalcula sin LLM), gráfica de amortización y botón "Aplicar plan" | `restructure_card_debt` aplica el plan y la tarjeta queda con la nueva mensualidad | **Funciona** |
| 2 | "Mándale $500 a Ana" | Formulario de transferencia prellenado con cuentas y beneficiarios reales | `transfer_funds` ejecuta la SPEI simulada, muestra folio y saldos nuevos | **Funciona** |
| 3 | "Concilia este ticket" (con foto) | Gemini extrae comercio, fecha y monto; UI de match contra movimientos o registro de gasto en efectivo | El movimiento queda conciliado o registrado | Propuesto |

---

## 4. Arquitectura

```
 Clientes                  API                     Agente                    Datos y acciones
┌────────────┐      ┌───────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│ Web        │      │ @norte/api    │      │ Groq                │      │ @norte/mcp-server    │
│ Mobile RN  │─────►│ Express       │─────►│ orquesta: intención │─────►│ 17 tools (zod)       │
│ Widget     │ SSE  │ /api/chat     │      │ → tools → UI JSON   │ MCP  │ hoy: mock en memoria │
│ Android    │◄─────│ /api/auth/*   │      │ Gemini              │stdio │ meta: Tiger Data     │
└────────────┘      └───────┬───────┘      │ analiza: insights,  │      │       + Snowflake    │
      ▲                     │              │ recibos, coach      │      └──────────────────────┘
      │                     ▼              └─────────────────────┘
      │             ┌───────────────┐
      │             │ ElevenLabs    │  STT (voz → texto) y TTS (texto → voz "Norte")
      │             └───────────────┘
      └──────── la interacción con la UI generada regresa al agente como contexto ────────┘

 Deploy: Vultr (Docker Compose, mismo archivo local y en producción)
```

Los tres pasos del reto mapeados a código real:

| Paso | Qué pasa | Dónde |
|---|---|---|
| Interpretar la intención | `POST /api/chat` abre un stream SSE; el agente recibe el mensaje y el historial, y decide qué herramientas llamar (varias en paralelo) | `apps/api/src/routes/chat.js`, `apps/api/src/agent.js` |
| Consultar datos y actuar | Cada tool call viaja por MCP (stdio) al servidor `banorte-banking`; las tools aplican reglas de negocio sobre un repositorio de datos; cada llamada y su resultado se transmiten en vivo (`tool_call`, `tool_result`) | `packages/mcp-server/src/server.js`, `src/tools.js`, `src/repositories/` |
| Generar la interfaz | El agente termina con `{"message", "ui": [...]}`; la API lo normaliza con el contrato y el evento `ui` llega al cliente, donde el renderer construye DOM seguro | `apps/api/src/ui-spec.js`, `packages/a2ui-schema`, `apps/web/public/renderer.js` |
| Cerrar el ciclo | Un formulario generado dispara `genui:form-submit`; el cliente reenvía `[form:<accion>] campo=valor` y el agente ejecuta la acción y genera la siguiente UI | `apps/web/public/js/agent.js` |
| Archivar la interfaz | El agente elige carpeta (`folder`) y título; la API guarda la visualización en la hypertable `ui_history` y devuelve un evento `history` con la fila | `apps/api/src/history-store.js`, `packages/a2ui-schema/src/folders.js` |

Dos decisiones de la base que vale la pena defender ante el jurado:

- **La seguridad vive en código, no en el prompt.** `transfer_funds` solo se ejecuta si el mensaje es un
  envío de formulario: el backend fija `confirmed`, el modelo no puede. Tope de $50,000 MXN por operación.
- **Una sola fuente de verdad.** El dashboard y el agente leen las mismas herramientas MCP; no hay datos
  duplicados en el frontend.

Detalle técnico de la base (endpoints, eventos SSE, herramientas, notas de resiliencia) en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## 5. Protocolo A2UI: Norte A2UI v2

El reto pide A2UI "o un protocolo equivalente". Norte A2UI v2 es nuestro perfil del protocolo abierto
[A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/) con un catálogo de componentes propio: el
agente describe la interfaz como una superficie (componentes + modelo de datos) que viaja por partes,
los controles escriben en ese modelo y lo derivado se recalcula en el cliente sin volver al LLM, y lo
que la persona toca regresa al agente como un evento tipado. Detalle completo en
[`docs/A2UI.md`](docs/A2UI.md); tradeoffs en [`docs/DECISIONES.md`](docs/DECISIONES.md).

```json
{"version":"v1.0","createSurface":{"surfaceId":"s_01","catalogId":"urn:norte:a2ui:catalog:banorte:v2",
  "dataModel":{"plan":{"balance":23410.5,"annualRate":26.9,"months":12}},
  "components":[
    {"id":"root","component":"Stack","children":["h","grid","plazo","aplicar"]},
    {"id":"h","component":"Header","title":"Reestructura tu saldo"},
    {"id":"grid","component":"Grid","columns":2,"children":["pago"]},
    {"id":"pago","component":"Kpi","label":"Pago mensual","value":{"call":"currency","args":{"v":{"call":"amortize","args":{"amount":{"path":"/plan/balance"},"months":{"path":"/plan/months"},"annualRate":{"path":"/plan/annualRate"}}}}}},
    {"id":"plazo","component":"Slider","label":"Plazo","value":{"path":"/plan/months"},"min":6,"max":36,"step":6,"unit":"meses"},
    {"id":"aplicar","component":"Button","label":"Aplicar plan","action":{"event":{"name":"confirm_restructure","context":{"months":{"path":"/plan/months"}}}}}
  ]}}
```

| Capa | Componentes | Para qué |
|---|---|---|
| Layout | `Stack` `Row` `Grid` `Card` `Section` `Tabs` `Divider` `List` | El agente acomoda la pantalla según la intención |
| Dominio | `Header` `Kpi` `AccountCard` `Chart` (16 tipos) `Table` `TransactionList` `Alert` `Progress` `Text` | Las piezas bancarias propias |
| Controles | `Slider` `Select` `ChoiceChips` `TextField` `Toggle` | Ligados al `dataModel`: recalculan sin LLM |
| Acciones | `Button` `Form` | Cierran el ciclo con un evento tipado |

Lo que el protocolo hace por el producto:

- **La pantalla se arma en vivo.** Con el primer tool call sale un esqueleto (`createSurface`); la
  interfaz final llega en chunks (`updateComponents`) de la raíz hacia abajo.
- **Cero latencia en lo interactivo.** Un `Slider` de plazo mueve los `Kpi` y la gráfica de
  amortización en el mismo frame: los valores viven en el `dataModel` y lo derivado se describe con
  `{"call":"amortize", ...}`, funciones puras de una tabla cerrada.
- **La misma pantalla se reconfigura.** "¿Y a 6 meses?" no reconstruye nada: el agente responde con
  un patch (`updateDataModel`) sobre la superficie activa, que viaja en cada petición.
- **Las acciones son eventos, no texto.** `POST /api/action` recibe `{surfaceId, event, dataModel}`;
  `transfer_funds` y `restructure_card_debt` solo se ejecutan si el evento está en la lista y su
  contexto valida con zod (`apps/api/src/actions.js`). El modelo sigue sin poder autorizar dinero.
- **Un runtime, tres consumidores.** `packages/a2ui-schema/src/core` no tiene dependencias: lo usa la
  API, se sirve tal cual a la web (`/a2ui/*.js`) y se copia a la app móvil (`npm run sync:a2ui`, con
  un test que falla si difiere).
- **Negociación de catálogo.** Cada cliente anuncia qué componentes sabe pintar y el prompt se
  restringe a eso (`GET /api/a2ui/catalog` publica el catálogo).
- **Compatibilidad.** El historial v1 se eleva a superficie al leerse y cada superficie lleva su
  proyección v1; el canal viejo `[form:transfer_funds] …` sigue aceptado.

Tradeoff registrado: el modelo escribe JSON anidado y el servidor lo aplana a la lista de adyacencia de
A2UI, porque los LLM generan grafos con ids mucho peor que árboles. Y el presupuesto de tokens del
orquestador (Groq on-demand: 8 000 por minuto) obligó a un prompt compacto (~2 800 tokens) y a resumir
el modelo de datos que se le devuelve; ver DECISIONES.

---

## 6. Retos MLH

Cada tecnología entra con un rol claro dentro de la arquitectura, no como un módulo pegado al final.
Regla: **cada proveedor externo tiene fallback** para que la demo nunca dependa de un solo servicio.

| Reto | Qué pide | Cómo lo usa Norte AI | Mínimo viable para la demo |
|---|---|---|---|
| **Gemini API** | Una app de IA que entienda lenguaje, analice datos y use la API con creatividad | **Gemini es el agente que conduce la conversación.** Lee lo que escribe la persona, decide qué tools MCP llamar (saldos, movimientos, gastos, transferencias) y con el resultado **redacta el texto y arma la pantalla** en Norte UI Spec: function calling nativo con el mismo esquema de tools, en `apps/api/src/providers/gemini.js` (`LLM_PROVIDER=gemini`). Ese mismo texto es el que se entrega a ElevenLabs para el modo audio y el modo conversación, así que el turno hablado y el escrito salen del mismo razonamiento. También genera los **embeddings de 768 dims** de la memoria del agente y extrae de cada turno los hechos duraderos que se guardan en Tiger. | Conversación completa (texto + UI generada + voz) corriendo sobre Gemini |
| **ElevenLabs** | Agentes que hablan | **La voz del asistente, en los dos modos de voz.** *Modo audio*: la respuesta que escribió Gemini se lee con Text-to-Speech con la voz "Norte" en español mexicano, en streaming, mientras la interfaz se sigue dibujando. *Modo conversación*: Speech-to-Text toma el micrófono (web y mobile), el texto entra a Gemini y la respuesta vuelve hablada — manos libres de punta a punta. Va por endpoints propios `POST /api/voice/transcribe` y `POST /api/voice/speak` (`apps/api/src/services/elevenlabs.js`), así la key nunca llega al cliente. Fallback: Web Speech API (`apps/web/public/js/voice.js`). | Modo audio y modo conversación funcionando en la demo |
| **Tiger Data** | App rápida y escalable con SQL | **Base operacional y memoria del agente — integrado.** Postgres 18 + TimescaleDB 2.30 en Tiger Cloud. **Hypertables**: `transactions` (movimientos, chunks de 30 días) y `ui_history` (cada interfaz que genera el agente, chunks de 7 días e índice trigram sobre el título para el buscador) — particionado por tiempo, que es como realmente se consultan. **Continuous aggregates** `spending_by_category_monthly` y `monthly_cashflow`, con refresh policy y agregación en tiempo real: `get_spending_by_category`, `get_monthly_cashflow` y `get_spending_trend` leen el agregado ya calculado en vez de recorrer otra vez todos los movimientos. **Funciones del toolkit de Timescale**: `time_bucket` y `time_bucket_gapfill` para que los meses sin gasto no desaparezcan de la serie, y `stats_agg` → `average`/`stddev` para sacar la línea base de la persona ("en agosto gastaste 28% más que tu promedio"). **Memoria del agente**: tabla `customer_memory` con `pgvector` (embeddings Gemini de 768 dims, índice HNSW); al cerrar cada turno se extraen hechos duraderos ("prefiere plazos cortos", "Ana es su casera") y en el siguiente se recuperan por similitud y entran al prompt. Las tools MCP leen vía repositorios (`memory` \| `tiger`, se elige con `BANK_DATA_SOURCE`); la transferencia es atómica con la condición de saldo dentro del `UPDATE`. Carga con `npm run db:setup`, paridad contra la base real con `npm run db:verify`. Local: contenedor TimescaleDB en `infra/docker-compose.yml`. | Cuentas, movimientos, gastos, tendencia, historial de visualizaciones y memoria leyendo y escribiendo en Tiger |
| **Snowflake** | Uso de Snowflake para APIs y LLMs | **El "¿esto es normal?" del asistente — integrado.** Un gasto solo significa algo comparado contra algo, y esa comparación vive en Snowflake: un dataset sintético poblacional (miles de clientes, 24 meses) que responde las dos preguntas que importan. (a) **Contra tu propio historial**: si este mes te saliste de tu promedio y en qué categoría. (b) **Contra gente de tu mismo perfil** (edad, ingreso, ciudad): "gastas 30% más que personas como tú en restaurantes". Cortex AI hace el trabajo pesado del lado del dato — `AI_CLASSIFY` para categorizar, `AI_AGG` / `AI_COMPLETE` para resumir el segmento — y todo llega al agente como una sola tool MCP `get_peer_benchmark`, que Gemini usa para justificar una alerta o proponer una meta. | Comparación contra el historial propio y contra pares, visible dentro de la UI generada |
| **Vultr** | Develop locally, deploy globally | **Ahí vive la app.** Norte AI está desplegado en un Vultr Cloud Compute con el **mismo `docker-compose.yml` que corre en local**, así que lo que se prueba en la laptop es literalmente lo que se sirve. **Conectado a GitHub**: el workflow `.github/workflows/deploy-vultr.yml` corre los tests y, si pasan, entra por SSH y levanta el compose en cada push a `main` — se mergea y a los minutos está en el teléfono, sin deploys a mano. **HTTPS propio**: Caddy delante de la API pide y renueva el certificado de Let's Encrypt solo, con `sslip.io` cuando no hay dominio registrado (cero DNS, cero costo), y con `flush_interval -1` en `/api/chat` y `/api/voice/*` para no romper el streaming de la UI ni el de la voz. La app móvil y el widget Android apuntan a esa URL pública. | API pública con HTTPS accesible desde el celular de la demo |

División de trabajo entre modelos: **Gemini conduce el turno** — lee, decide qué tools llamar, escribe
la respuesta y arma la interfaz — y esa misma respuesta es la que **ElevenLabs habla**. **Groq queda como
proveedor alterno** (`LLM_PROVIDER=groq`, el default del código) por latencia, para el caso de que la
cuota diaria de Gemini se agote en medio de la demo: mismo contrato `chat()`, mismo esquema de tools, se
cambia con una variable de entorno. **Tiger Data** guarda lo que pasó (movimientos, interfaces generadas,
memoria) y **Snowflake** dice si eso que pasó es normal comparado con el historial de la persona y con
gente de su mismo perfil.

---

## 7. Mobile (React Native) y widget Android

App **Expo SDK 57 con dev build** (no Expo Go: el widget necesita código nativo). Consume los mismos
endpoints de `@norte/api` y renderiza el mismo **Norte UI Spec v1** con componentes nativos propios.
Detalle completo en [`apps/mobile/README.md`](apps/mobile/README.md).

### Lo que ya funciona

| Pieza | Estado |
|---|---|
| Login con usuario y contraseña contra `POST /api/auth/login` | ✅ |
| Desbloqueo con **huella o Face ID** según lo que ofrezca el dispositivo | ✅ |
| Pestañas **Chat · Historial · Categorías** y barra inferior de 5 accesos | ✅ |
| Renderer nativo de los 10 componentes y las 16 gráficas del contrato | ✅ |
| Streaming SSE del agente (se ve pensar, llamar herramientas y construir) | ✅ |
| Voz: dictado con ElevenLabs STT y respuesta hablada con TTS | ✅ |
| Cuentas, Transferencias, Inversiones y Servicios sobre `/api/dashboard` | ✅ |
| **Widget Android** con Abrir app · Voz por deep link | ✅ |

### Sesión y biometría

```
  primera vez                      siguientes
┌──────────────┐                 ┌──────────────┐
│ usuario +    │                 │ huella o     │
│ contraseña   │                 │ Face ID      │
└──────┬───────┘                 └──────┬───────┘
       │ POST /api/auth/login            │ el sistema aprueba
       ▼                                 ▼
  token firmado ──► expo-secure-store ──► GET /api/auth/session ──► adentro
```

**La biometría nunca viaja al servidor.** El sistema operativo responde sí o no y, solo con un sí, la
app lee el token que ya tenía en el llavero (Keychain / EncryptedSharedPreferences). Es lo que hace la
banca real y evita inventar un protocolo biométrico propio, que sería lo más fácil de romper.

El token es un JSON firmado con HMAC-SHA256 (`apps/api/src/auth/tokens.js`), sin dependencias. Los
usuarios son sintéticos, con la contraseña verificada por scrypt y comparación en tiempo constante
(`apps/api/src/auth/users.js`): **regina**, **carlos** y **maria**, todos con `Banorte2026`.

> El `preferredName` de la sesión es con el que saluda la app ("Hola Regina"); el perfil bancario
> sigue viniendo de la herramienta MCP `get_customer_profile`, que es la única fuente de verdad de los
> datos. Hoy los tres usuarios comparten el cliente sintético `CLT-889201`.

La web usa las mismas credenciales y el mismo `POST /api/auth/login` (con `channel: 'web'`). Donde el
teléfono guarda el token en el llavero del sistema, el navegador lo guarda en `localStorage`: no tiene
llavero, y la CSP (`script-src 'self'`) es lo que impide que un script ajeno lo lea. `attachSession`
sigue siendo permisivo para que `GET /api/health` y el propio login respondan sin token; con
`AUTH_REQUIRED=true` se endurece toda la API el día de la demo.

### La web, pantalla por pantalla

| Ruta | Pantalla | Sesión |
|---|---|---|
| `/login` | Acceso: usuario, contraseña y el mismo endpoint que la app móvil | pública |
| `/` · `/inicio` | Portada de banca en línea: saldo, accesos rápidos, movimientos, alertas y favoritos | requerida |
| `/asistente` | El agente: sugerencias, lienzo generativo e historial | requerida |

Las dos privadas se guardan solas: sin token redirigen a `/login?next=…` y vuelven a donde ibas al
entrar. Un `401` de la API se maneja en un único lugar (`js/api.js`), que borra la sesión y manda al
login sin que cada pantalla tenga que acordarse.

La portada se arma con **`GET /api/overview`** (cuentas, movimientos, frecuentes y las alertas que se
derivan de ellos) — tres herramientas MCP, no las doce de `/api/dashboard`: entrar a la banca en línea
no puede costar un dashboard completo. El acceso al asistente es la primera tarjeta de los accesos
rápidos, en rojo y marcada como nueva: es la puerta a la parte generativa del producto, no un trámite
más de la lista.

### Widget "Norte AI"

| Botón | Deep link | Qué pasa |
|---|---|---|
| ⌨️ **Abrir app** | `norteai://chat?mode=text` | Entra al chat con el teclado listo |
| 🎤 **Voz** | `norteai://chat?mode=voice` | Entra al chat **grabando**, y el agente responde hablando |

El widget no habla con la API ni guarda estado: solo abre deep links, así que no puede quedar
desincronizado. Lo único que lee es el nombre de la sesión para saludar. Si la app estaba bloqueada,
la intención no se pierde: se vuelve a leer el link después del desbloqueo.

### Dos decisiones que vale la pena defender

- **SSE por XMLHttpRequest.** `fetch` en React Native no expone `response.body`, así que la interfaz
  generada aparecería de golpe al final y perderíamos justo lo que el reto premia. XHR sí entrega
  `responseText` parcial (`apps/mobile/src/api/sse.js`).
- **La pantalla de Transferencias no transfiere.** Prepara la intención y se la pasa al agente, que
  genera el formulario y ejecuta `transfer_funds`. La regla de seguridad no tiene un atajo por móvil.

---

## 8. Estructura del repositorio

Monorepo con npm workspaces. Los paquetes usan el scope `@norte/*`.

```
AuraTripleT/
├── README.md                  ← este documento
├── package.json               ← raíz: workspaces + scripts dev / start / test / mcp
├── .env.example               ← nombres de todas las variables (hoy y objetivo)
├── docs/
│   └── ARQUITECTURA.md        ← detalle técnico de la base
├── apps/
│   ├── api/                   @norte/api · Express + agente + cliente MCP + streaming SSE
│   │   ├── src/index.js       arranque: carga el .env de la raíz, listen, precalienta MCP
│   │   ├── src/app.js         createApp(): middleware + rutas, sin puerto (así se prueba)
│   │   ├── src/routes/        health · auth · dashboard · customer · overview · credit · chat (SSE) · history · voice
│   │   ├── src/auth/          usuarios sintéticos (scrypt) + tokens firmados (HMAC)
│   │   ├── src/middleware/    security (CORS + CSP) · rate-limit · error-handler
│   │   ├── src/agent.js       loop de tool calling y SYSTEM_PROMPT
│   │   ├── src/providers/     proveedores LLM intercambiables (groq hoy; gemini se registra aquí)
│   │   ├── src/ui-spec.js     parsea y normaliza la respuesta del modelo con @norte/a2ui-schema
│   │   ├── src/mcp-client.js  lanza @norte/mcp-server como subproceso
│   │   ├── src/history-store.js  historial de visualizaciones en Tiger (fallback en memoria)
│   │   └── tests/             agent · auth · routes · history · providers · ui-spec · mcp (e2e)
│   ├── web/                   @norte/web · UI web vanilla (la sirve @norte/api)
│   │   └── public/            login.html (/login) · inicio.html (/ y /inicio) · index.html (/asistente)
│   │                          renderer.js (Norte UI Spec → DOM)
│   │                          js/: session (token) · login · inicio (portada) · app · agent (SSE) ·
│   │                               history (línea de tiempo + carpetas) · suggest · ui · api · voice · i18n · icons
│   │                          css/: tokens · portal · auth · shell · suggest · rail · generated
│   └── mobile/                @norte/mobile · Expo SDK 57 (dev build) + widget Android
│       ├── app.config.js      scheme norteai · permisos · plugin del widget · extra.apiUrl
│       ├── src/api/           client · sse (streaming por XHR) · endpoints
│       ├── src/auth/          AuthProvider (4 estados) · biometrics (biometría + llavero)
│       ├── src/charts/        motor de gráficas propio en SVG (los 16 tipos del catálogo)
│       ├── src/renderer/      Norte UI Spec → nativo (gemelo de public/renderer.js)
│       ├── src/screens/       Login · Unlock · Assistant · Cuentas · Transferencias ·
│       │                      Inversiones · Servicios
│       ├── src/voice/         dictado y voz del agente vía /api/voice/*
│       └── widget/            NorteWidget + manejador de eventos de Android
├── packages/
│   ├── mcp-server/            @norte/mcp-server · servidor MCP banorte-banking
│   │   ├── src/server.js      registra las 17 herramientas con zod (stdio)
│   │   ├── src/tools.js       createBankingTools(repo): reglas de negocio puras
│   │   ├── src/repositories/  fuentes de datos: memory · tiger (TimescaleDB), se elige con BANK_DATA_SOURCE
│   │   ├── src/data/          seeds sintéticos: cliente, cuentas, movimientos, mercado
│   │   ├── scripts/           build-seed.js: genera data/seeds/002_seed.sql desde los mocks
│   │   └── tests/             tools · repositories
│   ├── a2ui-schema/           @norte/a2ui-schema · contrato Norte UI Spec v1 (catálogo + esquemas zod)
│   └── shared/                (placeholder) formatters, i18n, tipos
├── data/seeds/                esquema y seed de Tiger Data (001_schema.sql · 002_seed.sql)
├── scripts/                   db-setup.js (carga el esquema) · db-verify.js (paridad contra la base real)
└── infra/                     Dockerfile · docker-compose (api + timescaledb) ·
                               docker-compose.vultr.yml + Caddyfile (HTTPS) para producción
```

Las carpetas marcadas como placeholder existen para reservar su lugar y tienen un README con lo que
va ahí. Se llenan en las fases 2 y 3. Cada workspace tiene sus tests; `npm test` en la raíz corre todos.

### Quiero agregar X, ¿dónde va?

| Quiero agregar… | Va en… | Y además… |
|---|---|---|
| Una herramienta MCP nueva | `packages/mcp-server/src/tools.js` + registro en `src/server.js` | Test en `packages/mcp-server/tests/`; el agente la descubre solo |
| Un tipo de componente de UI | `packages/a2ui-schema/src/core/catalog-v2.js` (firma + hint) | Renderer web **y** mobile —`catalog-parity.test.js` falla si falta en alguno—, su equivalencia en `core/degrade.js` y, si es un tipo v1, su esquema en `schemas.js` |
| Un proveedor LLM (Gemini) | `apps/api/src/providers/<nombre>.js` + registro en `providers/index.js` | Mismo contrato `chat()` que Groq; test con fetch falso como `providers-groq.test.js` |
| Una fuente de datos (Tiger, Snowflake) | `packages/mcp-server/src/repositories/<nombre>.js` + registro en `repositories/index.js` | Mismo contrato que `memory.js`; las tools no cambian |
| Un servicio externo que no es LLM (ElevenLabs) | `apps/api/src/services/<nombre>.js` + su ruta en `routes/` | Key solo en `.env`; fallback documentado |
| Un endpoint HTTP | `apps/api/src/routes/<nombre>.js` + registro en `app.js` | Validación de entrada; test en `apps/api/tests/routes.test.js` |
| Datos de prueba | `data/seeds/` o `data/snowflake/` | Nunca datos reales |
| Un secreto | Solo `.env` (raíz) | Nombre documentado en `.env.example` |
| Una decisión técnica | `docs/DECISIONES.md` | Con el tradeoff: qué se descartó y por qué |

---

## 9. Reglas del proyecto

### Del reto (no negociables)

- Componentes de UI propios; no se usa biblioteca ajena para lo que genera el agente.
- Datos y APIs propios, siempre sintéticos.
- Al menos un flujo accionable completo antes de abrir otro.
- LLM, MCP y A2UI presentes en cada flujo que mostremos.

### De producto

- **Toda respuesta es UI.** El agente no devuelve muros de texto; `text` es un componente más, breve.
- **Toda UI es accionable y regresa al agente.** Si un componente no puede llevar a una acción, se cuestiona.
- **Nunca inventar cifras.** Todo número viene de una herramienta MCP; el prompt ya lo exige.
- **Las acciones con dinero se confirman en código.** El modelo propone un formulario; solo el envío del
  formulario autoriza la acción.
- **Español mexicano** en todo el copy; tono profesional y cercano.
- **Un problema pequeño resuelto completo** antes que cinco pantallas a medias.

### De ingeniería

- El agente y los clientes solo acceden a datos vía tools MCP; nadie consulta la base de datos directo.
- Validación con zod en toda frontera: argumentos de tools, cuerpos de requests y la spec de UI (`@norte/a2ui-schema`).
- Los renderers nunca usan `innerHTML` ni HTML crudo con salida del modelo.
- Secretos solo en `.env` en la raíz; `.env.example` siempre actualizado; `.env` nunca se sube.
- Cada herramienta nueva trae su test (`node --test`); `npm test` verde antes de cualquier merge.
- Sin `console.log` de depuración en código que se entrega.
- Archivos de menos de 400 líneas; si crece, se parte por responsabilidad.
- Cada proveedor externo tiene fallback: Groq → Gemini, ElevenLabs → Web Speech API, Tiger → mock en
  memoria. La demo nunca se cae por un tercero.
- `main` siempre se puede demostrar.

### De git y equipo

- Ramas `feat/<tema>`, `fix/<tema>`, `docs/<tema>`; se integran a `main` por PR.
- Commits en formato convencional: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Un PR lo revisa al menos otra persona y llega con `npm test` verde.
- Nada de secretos ni datos personales reales en el repositorio, ni en commits ni en issues.
- Identificadores de código en inglés; copy de UI, documentación y commits en español.

### De UI (solo el límite)

El rediseño de la interfaz es un track aparte. Cambia tokens, layout y animaciones; **no cambia** los
tipos de Norte UI Spec ni los endpoints. Si un cambio de diseño necesita un componente nuevo, se agrega
al contrato primero.

---

## 10. Cómo correrlo

Requisitos: Node.js 18 o superior y una API key de Groq.

```bash
npm install
```

```bash
cp .env.example .env
```

Edita `.env` y pon tu `GROQ_API_KEY`. Luego:

```bash
npm run dev
```

Abre `http://localhost:3040`: entra por la pantalla de acceso con **regina**, **carlos** o **maria** y
la contraseña `Banorte2026`. Para correr las pruebas de los cuatro workspaces:

```bash
npm test
```

Otros scripts desde la raíz: `npm start` (igual que `dev`), `npm run mcp` (levanta solo el servidor
MCP por stdio, útil para inspectores MCP). Con Docker: `docker compose -f infra/docker-compose.yml up --build`
(ver `infra/README.md`).

### Variables de entorno

| Variable | Estado | Para qué |
|---|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Hoy | Orquestador (`openai/gpt-oss-120b`) |
| `PORT` | Hoy | Puerto de la API (3040) |
| `LLM_PROVIDER` | Hoy (opcional) | `groq` (default, el más rápido) o `gemini` (tier gratis por requests/día: aguanta turnos encadenados) |
| `BANK_DATA_SOURCE` | Hoy (opcional) | Fuente de datos del MCP: `memory` (default) o `tiger` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Hoy | Orquestador alterno (`gemini-3.6-flash`); insights, recibos y coach siguen como objetivo |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Hoy (opcional) | STT y TTS. Sin ellas la web cae a Web Speech del navegador. El voice ID debe ser una voz `premade`: las de librería piden plan de pago |
| `DATABASE_URL` | Hoy (opcional) | Tiger Data (TimescaleDB). Sin ella el MCP usa los seeds en memoria y el historial no persiste |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE` | Hoy (opcional) | Benchmarks de pares y Cortex AI. Sin ellas la tool `get_peer_benchmark` no se registra y el resto del agente sigue igual |
| `DEMO_CUSTOMER_ID` | Hoy (opcional) | Cliente al que se le atribuye el historial (default `CLT-889201`) |
| `AUTH_SECRET`, `AUTH_TOKEN_TTL_HOURS` | Hoy (opcional) | Firma de las sesiones. Sin ella se genera una por proceso y las sesiones mueren al reiniciar; con `NODE_ENV=production` es obligatoria |
| `AUTH_REQUIRED` | Hoy (opcional) | `true` exige token en toda `/api`. Default `false` para no romper la web |
| `PUBLIC_API_URL` | Hoy | URL que se compila en la app móvil. Se puede cambiar en caliente desde Servicios → Conexión |
| `NORTE_DOMAIN` | Hoy (solo Vultr) | Dominio con el que Caddy pide el certificado. Sin dominio propio: `<ip-con-guiones>.sslip.io` |

---

## 11. Plan de trabajo

| Fase | Qué | Hecho cuando… |
|---|---|---|
| 0 · Base | MCP ✅ · Conexión a API ✅ · UI web base ✅ · Monorepo + contrato + proveedores + repositorios ✅ · UI mobile ✅ | `npm test` verde y el flujo de transferencia funciona de punta a punta |
| 1 · Wireframe UI | Wireframes de la nueva interfaz (listo mañana en la mañana) | El equipo aprueba los wireframes y el track de UI arranca sin bloquear al resto |
| 2 · Mobile + widget ✅ | App Expo (login + biometría + renderer nativo + voz) y widget Android con accesos Abrir app / Voz | Desde el widget se abre el chat y se completa una consulta |
| 3 · Retos MLH | Gemini, ElevenLabs, Tiger Data, Snowflake y Vultr en el orden de la tabla de la sección 6 | Cada reto cumple su mínimo viable y aparece en el guion |
| 4 · Norte A2UI v2 ✅ | Protocolo A2UI (superficies, dataModel, bindings, eventos tipados), streaming por chunks, runtime compartido web/mobile, flujo de reestructura de tarjeta | Slider sin latencia, patch sobre la superficie activa y "Aplicar plan" ejecutando `restructure_card_debt`; `npm test` verde (167 pruebas) |
| 5 · Entregables | `docs/A2UI.md` ✅ · `docs/DECISIONES.md` ✅ · guion de demo · deploy final | Demo ensayada completa en menos de 5 minutos |

---

## 12. Entregables para el jurado

- [ ] **Demo en vivo:** intención → UI generada → interacción → acción real.
- [ ] **Repositorio:** componentes, servidor MCP, capa A2UI e instrucciones para correrlo (este README).
- [ ] **APIs y datasets:** servicios y datos sintéticos creados por el equipo (`data/`, `packages/mcp-server`).
- [x] **Decisiones técnicas:** diagrama de arquitectura y tradeoffs de modelo, protocolo e infraestructura (`docs/DECISIONES.md`, protocolo en `docs/A2UI.md`).

Documentos relacionados: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) (base técnica) ·
[`apps/mobile/README.md`](apps/mobile/README.md) · [`packages/a2ui-schema/README.md`](packages/a2ui-schema/README.md) ·
[`data/README.md`](data/README.md) · [`infra/README.md`](infra/README.md).

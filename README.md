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
| [5. Norte UI Spec](#5-protocolo-a2ui-norte-ui-spec-v1) | Nuestro protocolo A2UI |
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
| **A2UI** | Agent-to-UI o un protocolo equivalente para transmitir la interfaz que genera el agente | Norte UI Spec (sección 5) + `apps/web/public/renderer.js` |

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
| 1 | "¿En qué se me va el dinero?" / "Quiero gastar menos" | Gráfica de gastos por categoría + insight de Gemini + formulario para crear una meta o presupuesto | Se persiste la meta y la UI se reconfigura con una barra de progreso | Propuesto |
| 2 | "Mándale $500 a Ana" | Formulario de transferencia prellenado con cuentas y beneficiarios reales | `transfer_funds` ejecuta la SPEI simulada, muestra folio y saldos nuevos | **Funciona** |
| 3 | "Concilia este ticket" (con foto) | Gemini extrae comercio, fecha y monto; UI de match contra movimientos o registro de gasto en efectivo | El movimiento queda conciliado o registrado | Propuesto |

---

## 4. Arquitectura

```
 Clientes                  API                     Agente                    Datos y acciones
┌────────────┐      ┌───────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│ Web        │      │ @norte/api    │      │ Groq                │      │ @norte/mcp-server    │
│ Mobile RN  │─────►│ Express       │─────►│ orquesta: intención │─────►│ 14 tools (zod)       │
│ Widget     │ SSE  │ /api/chat     │      │ → tools → UI JSON   │ MCP  │ hoy: mock en memoria │
│ Android    │◄─────│ /api/voice/*  │      │ Gemini              │stdio │ meta: Tiger Data     │
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
| Interpretar la intención | `POST /api/chat` abre un stream SSE; el agente recibe el mensaje y el historial, y decide qué herramientas llamar (varias en paralelo) | `apps/api/src/index.js`, `apps/api/src/agent.js` |
| Consultar datos y actuar | Cada tool call viaja por MCP (stdio) al servidor `banorte-banking`; cada llamada y su resultado se transmiten en vivo (`tool_call`, `tool_result`) | `packages/mcp-server/src/server.js`, `packages/mcp-server/src/tools.js` |
| Generar la interfaz | El agente termina con `{"message", "ui": [...]}`; el evento `ui` llega al cliente y el renderer construye DOM seguro | `apps/web/public/renderer.js` |
| Cerrar el ciclo | Un formulario generado dispara `genui:form-submit`; el cliente reenvía `[form:<accion>] campo=valor` y el agente ejecuta la acción y genera la siguiente UI | `apps/web/public/js/ai-panel.js` |

Dos decisiones de la base que vale la pena defender ante el jurado:

- **La seguridad vive en código, no en el prompt.** `transfer_funds` solo se ejecuta si el mensaje es un
  envío de formulario: el backend fija `confirmed`, el modelo no puede. Tope de $50,000 MXN por operación.
- **Una sola fuente de verdad.** El dashboard y el agente leen las mismas herramientas MCP; no hay datos
  duplicados en el frontend.

Detalle técnico de la base (endpoints, eventos SSE, herramientas, notas de resiliencia) en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## 5. Protocolo A2UI: Norte UI Spec v1

El reto pide A2UI "o un protocolo equivalente". Norte UI Spec es el nuestro: un JSON declarativo que
el agente emite y que cualquier cliente (web hoy, mobile después) renderiza con sus propios componentes.

```json
{
  "message": "Resumen breve para la persona (1-3 frases)",
  "ui": [
    { "type": "header", "title": "Tus gastos de septiembre", "badge": "Análisis" },
    { "type": "kpi_grid", "items": [{ "label": "Total", "value": "$18,400", "trend": "up" }] },
    { "type": "chart", "chartType": "doughnut", "labels": ["Comida", "Transporte"], "datasets": [{ "data": [6200, 3100] }] },
    { "type": "form", "action": "create_goal", "submitLabel": "Crear meta", "fields": [{ "name": "amount", "inputType": "number" }] }
  ]
}
```

| Tipo | Para qué lo usa el agente |
|---|---|
| `header` | Encabezado de la vista generada, con badge de contexto |
| `kpi_grid` | 2 a 4 métricas clave con tendencia |
| `balance_cards` | Tarjetas de cuentas (débito, ahorro, crédito) |
| `chart` | Barras, líneas, pie o dona a partir de datos reales de las tools |
| `table` | Datos tabulares |
| `transaction_list` | Movimientos con fecha, categoría y monto |
| `form` | **El componente accionable**: campos con opciones reales, `action` que el agente ejecuta al enviarse |
| `alert` | Confirmaciones, avisos y errores |
| `progress` | Uso de crédito, avance de metas |
| `text` | Texto breve con negritas y código |

Reglas del protocolo:

- **Un solo contrato.** Hoy vive en el `SYSTEM_PROMPT` de `apps/api/src/agent.js` y en el renderer web.
  Se extrae a `packages/a2ui-schema` (zod) para que API, web y mobile validen y rendericen lo mismo.
- **Los componentes son nuestros.** El rediseño de UI cambia la piel (tokens, layout, animaciones), no
  los tipos ni sus campos.
- **Renderizado seguro por construcción.** Solo `createElement` y `textContent`; enums (tipo de gráfica,
  nivel de alerta, tipo de cuenta) se validan contra listas cerradas.
- **Tolerante al modelo.** El renderer acepta variantes razonables (`fields` o `inputs`, opciones como
  objeto o string) para no romper la demo por un detalle del LLM.

Tradeoff registrado: usar el protocolo A2UI de Google daría puntos de "estándar", pero el JSON propio ya
funciona, es más simple de renderizar en dos plataformas y es seguro por diseño. Si sobra tiempo se
alinean nombres de campos con A2UI.

---

## 6. Retos MLH

Cada tecnología entra con un rol claro dentro de la arquitectura, no como un módulo pegado al final.
Regla: **cada proveedor externo tiene fallback** para que la demo nunca dependa de un solo servicio.

| Reto | Qué pide | Cómo lo usa Norte AI | Mínimo viable para la demo |
|---|---|---|---|
| **Gemini API** | Una app de IA que entienda lenguaje, analice datos y use la API con creatividad | **Gemini es el analista.** (a) Tool MCP `analyze_finances`: hasta 12 meses de movimientos a Gemini Flash con salida estructurada → gastos hormiga, suscripciones, anomalías y metas sugeridas. (b) Tool `parse_receipt`: foto de ticket o comprobante → `{comercio, fecha, monto, categoría}` para conciliación (multimodal). (c) Coach de educación financiera que explica CAT, intereses o SPEI con los datos de la persona. (d) Fallback de orquestación: `LLM_PROVIDER=gemini` usa function calling nativo con el mismo esquema de tools. | (a) y (b) visibles en el guion de la demo |
| **ElevenLabs** | Agentes que hablan | **STT + TTS, el LLM sigue siendo el cerebro.** Speech-to-Text para el micrófono (web y mobile) y Text-to-Speech con la voz "Norte" en español mexicano, con streaming, para leer el `message`. Endpoints propios `POST /api/voice/transcribe` y `POST /api/voice/speak`: la key nunca llega al cliente. Fallback: Web Speech API (`apps/web/public/js/voice.js`). | TTS en web y mobile, STT en mobile |
| **Tiger Data** | App rápida y escalable con SQL | **Base operacional.** Postgres + TimescaleDB en Tiger Cloud: `transactions` como hypertable, continuous aggregates para gasto por categoría y flujo mensual, multi-cliente por `customer_id`. Las tools MCP leen vía repositorios (`memory` = mock actual, `tiger` = pg). Local: contenedor TimescaleDB en `infra/docker-compose.yml`. | Cuentas, movimientos y gastos leyendo de Tiger con seed sintético |
| **Snowflake** | Uso de Snowflake para APIs y LLMs | **Capa analítica.** Dataset sintético poblacional (miles de clientes, 24 meses) para **benchmarks de pares** ("gastas 30% más que personas como tú en restaurantes") y Cortex AI: `AI_CLASSIFY` para categorizar, `AI_AGG` / `AI_COMPLETE` para resúmenes, Cortex Analyst para preguntas en lenguaje natural. Expuesto como tool MCP `get_peer_benchmark` vía SQL REST API o `snowflake-sdk`. | Una consulta Cortex visible dentro de la UI generada |
| **Vultr** | Develop locally, deploy globally | **Infraestructura.** El mismo `docker-compose.yml` corre local y en un Vultr Cloud Compute (API + Caddy con HTTPS). Object Storage para imágenes de recibos. GitHub Action que despliega en cada push a `main`. La app móvil y el widget apuntan a la URL pública. | API pública accesible desde el celular de la demo |

División de trabajo entre modelos: **Groq orquesta** (baja latencia para que la UI aparezca en tiempo
real) y **Gemini analiza** (contexto largo, multimodal, salida estructurada). Riesgo asumido: como Groq
es el orquestador, las features de Gemini tienen que aparecer explícitamente en la demo o el jurado de
ese reto no las verá.

---

## 7. Mobile (React Native) y widget Android

- **Stack:** Expo con dev build (no Expo Go), porque el widget necesita código nativo. Librería
  `react-native-android-widget` (config plugin de Expo); verificar versión al implementar.
- **Widget "Norte AI":** dos accesos directos en la pantalla de inicio.
  - 🎤 **Hablar** → abre la app en `norteai://chat?mode=voice` y arranca la grabación con ElevenLabs STT.
  - ⌨️ **Escribir** → abre la app en `norteai://chat?mode=text` con el teclado listo.
  - Opcional: mostrar saldo disponible en el widget.
- **Misma API, mismo protocolo.** La app consume `/api/dashboard`, `/api/chat` (SSE) y `/api/voice/*`,
  y renderiza Norte UI Spec con componentes nativos.
- **Referencias visuales:** pendientes de compartir; el diseño de la UI es un track aparte.

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
│   │   ├── src/index.js       rutas, seguridad, rate limiting
│   │   ├── src/agent.js       loop de tool calling, SYSTEM_PROMPT, reparación de JSON
│   │   ├── src/mcp-client.js  lanza @norte/mcp-server como subproceso
│   │   └── tests/
│   ├── web/                   @norte/web · UI web vanilla (la sirve @norte/api)
│   │   └── public/            index.html · renderer.js · css/ · js/ · vendor/
│   └── mobile/                (placeholder) React Native + widget Android
├── packages/
│   ├── mcp-server/            @norte/mcp-server · servidor MCP banorte-banking
│   │   ├── src/index.js       exporta SERVER_PATH
│   │   ├── src/server.js      14 herramientas con zod (stdio)
│   │   ├── src/tools.js       lógica pura
│   │   ├── src/data/          mock: cliente, cuentas, movimientos, mercado
│   │   └── tests/
│   ├── a2ui-schema/           (placeholder) contrato Norte UI Spec en zod
│   └── shared/                (placeholder) formatters, i18n, tipos
├── data/                      (placeholder) seeds para Tiger · DDL y dataset para Snowflake
└── infra/                     (placeholder) docker-compose · deploy en Vultr
```

Las carpetas marcadas como placeholder existen para reservar su lugar y tienen un README con lo que
va ahí. Se llenan en las fases 2 y 3.

### Quiero agregar X, ¿dónde va?

| Quiero agregar… | Va en… | Y además… |
|---|---|---|
| Una herramienta MCP nueva | `packages/mcp-server/src/tools.js` + registro en `src/server.js` | Test en `packages/mcp-server/tests/`; el agente la descubre solo |
| Un tipo de componente de UI | `packages/a2ui-schema` (contrato) | Renderer web y renderer mobile; mención en el `SYSTEM_PROMPT` |
| Una integración externa (Gemini, ElevenLabs, Snowflake…) | `apps/api/src/providers/<nombre>/` | Variables en `.env.example`; fallback si el servicio falla |
| Un endpoint HTTP | `apps/api/src/index.js` (o `src/routes/` cuando crezca) | Validación de entrada y rate limiting |
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
- Validación con zod en toda frontera: argumentos de tools, cuerpos de requests y (objetivo) la spec de UI.
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

Abre `http://localhost:3040`. Para correr las 33 pruebas de todos los workspaces:

```bash
npm test
```

Otros scripts desde la raíz: `npm start` (igual que `dev`), `npm run mcp` (levanta solo el servidor
MCP por stdio, útil para inspectores MCP).

### Variables de entorno

| Variable | Estado | Para qué |
|---|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Hoy | Orquestador (`openai/gpt-oss-120b`) |
| `PORT` | Hoy | Puerto de la API (3040) |
| `LLM_PROVIDER` | Objetivo | `groq` o `gemini` como orquestador |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Objetivo | Insights, recibos, coach, fallback |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Objetivo | STT y TTS |
| `DATABASE_URL` | Objetivo | Tiger Data (TimescaleDB) |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE` | Objetivo | Benchmarks y Cortex AI |
| `PUBLIC_API_URL` | Objetivo | URL que usan la app móvil y el widget |

---

## 11. Plan de trabajo

| Fase | Qué | Hecho cuando… |
|---|---|---|
| 0 · Base | MCP ✅ · Conexión a API ✅ · UI web base ✅ · UI mobile ⬜ | `npm test` verde y el flujo de transferencia funciona de punta a punta |
| 1 · Wireframe UI | Wireframes de la nueva interfaz (listo mañana en la mañana) | El equipo aprueba los wireframes y el track de UI arranca sin bloquear al resto |
| 2 · Mobile + widget | App React Native y widget Android con accesos Hablar / Escribir | Desde el widget se abre el chat y se completa una consulta |
| 3 · Retos MLH | Gemini, ElevenLabs, Tiger Data, Snowflake y Vultr en el orden de la tabla de la sección 6 | Cada reto cumple su mínimo viable y aparece en el guion |
| 4 · Mejoras en el output | Más variedad y calidad en la UI generada, streaming por componente | Tres intenciones distintas producen tres pantallas claramente distintas |
| 5 · Entregables | `docs/DECISIONES.md`, guion de demo, deploy final | Demo ensayada completa en menos de 5 minutos |

---

## 12. Entregables para el jurado

- [ ] **Demo en vivo:** intención → UI generada → interacción → acción real.
- [ ] **Repositorio:** componentes, servidor MCP, capa A2UI e instrucciones para correrlo (este README).
- [ ] **APIs y datasets:** servicios y datos sintéticos creados por el equipo (`data/`, `packages/mcp-server`).
- [ ] **Decisiones técnicas:** diagrama de arquitectura y tradeoffs de modelo, protocolo e infraestructura (`docs/DECISIONES.md`).

Documentos relacionados: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) (base técnica) ·
[`apps/mobile/README.md`](apps/mobile/README.md) · [`packages/a2ui-schema/README.md`](packages/a2ui-schema/README.md) ·
[`data/README.md`](data/README.md) · [`infra/README.md`](infra/README.md).

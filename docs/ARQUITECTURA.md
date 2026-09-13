# Arquitectura técnica de la base · Norte AI 🏦⚡

> Documento técnico de la app base. La visión del proyecto, las reglas del equipo, la estructura del
> monorepo y el plan de los retos MLH están en el [README raíz](../README.md).

**Agentes de IA que generan interfaces en tiempo real** para servicios financieros, dentro de un
dashboard de inversión de nivel producto. Construido con **MCP** (Model Context Protocol) y **Groq**.

## ¿Qué es?

Un dashboard de inversión (dark glass + acento rosa) con un agente integrado, **Norte AI**, que ante
cada solicitud consulta herramientas bancarias vía MCP y **genera una interfaz única en JSON** que se
renderiza al instante en un panel lateral: tarjetas, KPIs, gráficas, tablas, formularios y alertas.

### Vistas y funciones

| Zona | Qué hace |
|---|---|
| **Panel › Cartera** | Réplica 1:1 del diseño de referencia: valor total con conteo animado y selector de periodo, tarjeta "Decisiones basadas en datos", lista de seguimiento con filtros (Más vistas / Ganan / Pierden), portafolio 2×2 y gráfica de rendimiento SVG que se dibuja al aparecer, con morph entre rangos (1D · 1S · 1M · 6M · 1A) y tooltip interactivo. |
| **Panel › Mercado** | Tarjetas con sparklines de las 8 acciones en seguimiento + tipos de cambio del día. |
| **Panel › Herramientas** | Simulador de crédito en vivo (llama a la herramienta MCP `simulate_credit`), convertidor de divisas con la tabla Banorte y lanzador de transferencias SPEI vía Norte AI. |
| **Portafolio** | Posiciones con peso, dona de distribución animada e inversiones bancarias (pagarés y fondos). |
| **Análisis** | Gastos por categoría, flujo de efectivo mensual, principales categorías, movimientos y cuentas Banorte. |
| **Comunidad** | Feed de ideas de inversión con interacciones. |
| **Norte AI** | Barra "Pregúntale a Norte AI" (atajo `/`), botón "Explorar insights de IA", clic en cualquier acción para analizarla. Panel deslizante con streaming SSE de estado, tool calls y UI generada. |
| **Voz** | Micrófono en la barra y en el panel: dictado con transcripción en vivo (Web Speech API, Chrome/Edge), envío automático al terminar y **respuesta leída en voz alta** cuando preguntaste por voz (desactivable en Ajustes). Mensajes claros si el navegador bloquea el micrófono. |
| **Extras** | Notificaciones, Ajustes (idioma ES/EN al instante, reducir animaciones, alertas), Soporte con FAQ, toasts, navegación por hash, layout responsivo. |

## Arquitectura

```
┌──────────────────┐  GET /api/dashboard   ┌──────────────┐
│  @norte/web      │ ◄──────────────────── │  @norte/api  │
│  (vanilla JS,    │  POST /api/chat (SSE) │  Express     │ ◄──── tool calling ────► Groq LLM
│  sin build)      │ ◄──────────────────── │  + Agente    │
│  dashboard+panel │                       └──────┬───────┘
└──────────────────┘                              │ MCP (stdio, subproceso)
                                                  ▼
                                       ┌──────────────────────┐
                                       │ @norte/mcp-server     │
                                       │ banorte-banking       │
                                       │ 16 herramientas       │
                                       │ (datos mock)          │
                                       └──────────────────────┘
```

1. El dashboard carga sus datos con **una sola llamada** (`/api/dashboard`) que el servidor resuelve
   ejecutando 12 herramientas MCP en paralelo: la misma fuente de verdad que usa el agente.
2. Cada solicitud a Norte AI va a `POST /api/chat` (Server-Sent Events). El agente expone las
   herramientas MCP al LLM (`openai/gpt-oss-120b` en Groq), transmite cada tool call en vivo y
   termina con una **superficie Norte A2UI** (componentes + modelo de datos) que viaja por partes: esqueleto con el
   primer tool call, componentes en chunks, y patches sobre la superficie activa. Ver [A2UI.md](A2UI.md).
3. Todo el DOM generado se construye con `createElement`/`textContent` — nunca `innerHTML` con
   contenido del modelo.
4. El cliente MCP (`apps/api/src/mcp-client.js`) lanza el servidor como subproceso usando la ruta que
   exporta el paquete `@norte/mcp-server` (`SERVER_PATH`), así la API no depende de la estructura de
   carpetas del servidor.
5. El LLM es un **proveedor intercambiable** (`apps/api/src/providers/`, `LLM_PROVIDER`), la salida del
   modelo se **normaliza con el contrato** `@norte/a2ui-schema` (árbol → lista de adyacencia, enums acotados) antes de emitir `a2ui`/`ui`, y las tools del
   MCP trabajan sobre un **repositorio de datos** (`BANK_DATA_SOURCE`: `memory` hoy, `tiger` después).

### Herramientas MCP

| Herramienta | Descripción |
|---|---|
| `get_customer_profile` | Perfil del cliente |
| `get_accounts` · `get_transactions` | Cuentas y movimientos |
| `get_spending_by_category` · `get_monthly_cashflow` | Análisis de gastos y flujo |
| `get_investments` | Pagarés y fondos Banorte |
| `get_exchange_rates` · `get_beneficiaries` | Divisas y beneficiarios SPEI |
| `list_credit_products` · `simulate_credit` | Catálogo y simulación con amortización real |
| `transfer_funds` | Transferencia SPEI simulada (requiere confirmación en código) |
| `get_card_restructure_options` · `restructure_card_debt` | Plan de pagos fijos para el saldo de la tarjeta: opciones por plazo y aplicación (requiere el evento `confirm_restructure`) |
| `get_portfolio` | Posiciones bursátiles (AAPL, AMZN, MSFT, NVDA), total y distribución |
| `get_watchlist` | Acciones en seguimiento con sparklines (`most_viewed` / `gain` / `lose`) |
| `get_portfolio_performance` | Series históricas deterministas para 1D/1W/1M/6M/1Y |

### Componentes de UI generativos (catálogo Norte A2UI v2)

Layout: `Stack`, `Row`, `Grid`, `Card`, `Section`, `Tabs`, `Divider`, `List`. Dominio: `Header`, `Kpi`,
`AccountCard`, `Chart`, `Table`, `TransactionList`, `Alert`, `Progress`, `Text`. Controles ligados al
`dataModel`: `Slider`, `Select`, `ChoiceChips`, `TextField`, `Toggle`. Acciones: `Button`, `Form`.
Los tipos v1 (`header`, `kpi_grid`, `balance_cards`…) se elevan automáticamente al catálogo v2.

### Gráficas

El componente `chart` cubre 16 tipos, con el vocabulario de [Bklit UI](https://bklit.com/docs):
`bar`, `stacked_bar`, `horizontal_bar`, `line`, `area`, `composed`, `pie`, `doughnut`, `ring`,
`gauge`, `radar`, `scatter`, `funnel`, `heatmap`, `candlestick` y `profit_loss`.

Bklit se distribuye como registry de shadcn/ui (React + visx, solo por npm), así que su
vocabulario y sus convenciones visuales están portados a la capa vanilla en
`apps/web/public/js/charts.js`: Chart.js para lo cartesiano y SVG propio para gauge, ring,
funnel y heatmap. La paleta vive en `css/tokens.css` como `--chart-1..8`, `--chart-grid` y
`--chart-track`, los mismos nombres que usa Bklit.

El catálogo de `packages/a2ui-schema/src/core/catalog-v2.js` (componentes) y `src/catalog.js` (gráficas) es la única fuente de verdad: de ahí
salen tanto el esquema que valida la respuesta del modelo como la sección del prompt que le
explica cuándo usar cada gráfica.

## Cómo correrlo

Desde la raíz del monorepo:

```bash
npm install            # instala los cuatro workspaces y enlaza @norte/*
cp .env.example .env   # y pon tu GROQ_API_KEY
npm run dev            # http://localhost:3040
```

El `.env` vive en la raíz del repo; `@norte/api` lo carga desde ahí sin importar el cwd.
Con Docker: `docker compose -f infra/docker-compose.yml up --build` (ver `infra/README.md`).

## App móvil (iOS / Android)

Pendiente: vivirá en [`apps/mobile`](../apps/mobile) como **React Native (Expo)** con widget de Android,
consumiendo este mismo backend (`/api/dashboard`, `/api/simulate-credit` y el stream SSE de
`/api/chat`). El servidor ya responde con CORS para permitirlo. Ver README raíz, sección "Mobile".

## Pruebas

```bash
npm test               # corre los tests de todos los workspaces
```

167 pruebas en cuatro workspaces: contrato v1 + núcleo A2UI + mensajes + sincronía (48), reglas de negocio y repositorio en
memoria (35, incluidas transferencias concurrentes y reestructura), y en la API (84) el loop del agente con proveedor falso + MCP real (esqueleto, chunks, patch, acciones tipadas), el proveedor Groq
con fetch falso (reintentos 429, rescate de `failed_generation`), las rutas HTTP con el stream SSE de
`/api/chat`, y la integración MCP de extremo a extremo (cliente real → servidor stdio → herramientas).

## Estructura

```
apps/api/                      @norte/api
  src/index.js                 Arranque: carga el .env de la raíz, listen, precalienta MCP
  src/app.js                   createApp(): middleware + rutas, sin puerto (así se prueba)
  src/routes/                  health · auth · a2ui (catálogo) · dashboard · customer · overview · credit · chat + action (SSE) · history · voice
  src/middleware/              security (CORS + CSP) · rate-limit · error-handler
  src/agent.js                 Loop de tool-calling con proveedor inyectable, prompt A2UI, esqueleto/chunks/patch
  src/a2ui-stream.js           Cómo se transmite una superficie por SSE
  src/actions.js               Eventos tipados y autorización de herramientas con dinero
  src/providers/               groq.js (reintentos, timeout, rescate de failed_generation) · gemini.js (generateContent, traducción OpenAI↔Gemini) · index.js (LLM_PROVIDER)
  src/ui-spec.js               Parsea la respuesta del modelo: superficie (árbol → plano) o patch
  src/mcp-client.js            Cliente MCP (subproceso) con reconexión
  tests/                       agent · routes · providers-groq · ui-spec · mcp (integración e2e)
apps/web/public/               @norte/web
  login.html                   Acceso (/login): usuario y contraseña contra /api/auth/login
  inicio.html                  Portada de banca en línea (/ y /inicio): saldo, accesos, movimientos, alertas
  index.html                   Asistente (/asistente): sugerencias, lienzo generativo y riel de historial
  css/                         tokens · portal · auth · shell · suggest · rail · generated
  js/                          session · login · inicio · app · agent · history · suggest · ui · api · voice · i18n · icons
  js/a2ui-web.js               Renderer A2UI (DOM reactivo por rutas del dataModel, 24 componentes)
  renderer.js                  Renderer v1 (miniaturas del historial)
packages/mcp-server/           @norte/mcp-server
  src/index.js                 Exporta SERVER_PATH, createBankingTools y los repositorios
  src/server.js                Servidor MCP (stdio) con 16 herramientas validadas con zod
  src/tools.js                 createBankingTools(repo): reglas de negocio puras
  src/repositories/            memory.js (seeds) · index.js (BANK_DATA_SOURCE); tiger pendiente
  src/data/mockData.js         Cliente, cuentas, movimientos, inversiones, divisas, créditos
  src/data/marketData.js       Posiciones, watchlist y generador determinista de series
  tests/                       tools · repositories
packages/a2ui-schema/          @norte/a2ui-schema
  src/core/                    Núcleo A2UI sin dependencias: pointer · binding · functions · catalog-v2 · flatten · compat · runtime
  src/messages.js              Mensajes A2UI (zod), normalizeAgentReply, parseUserAction
  src/catalog.js · schemas.js  Catálogo de gráficas y esquemas v1 (normalización de la parte literal)
  src/index.js                 Un solo punto de entrada para API y tests
scripts/sync-a2ui-core.js      Copia el núcleo a apps/mobile/src/a2ui/core (test de sincronía)
```

## Datos de prueba

Cliente ficticio **María Fernanda López García** (segmento Preferente): 3 cuentas (nómina, ahorro,
TDC Oro), 32 movimientos, 3 inversiones bancarias, 3 beneficiarios, 3 productos de crédito y un
portafolio bursátil en USD de 4 posiciones con 8 acciones en seguimiento. Todo es inventado.

## Notas técnicas

- **Animaciones**: entrada escalonada de tarjetas, conteo del valor total, trazado progresivo de la
  gráfica (stroke-dashoffset + clip del área), morph entre rangos, dona y barras animadas, hover
  states en todo. Respeta `prefers-reduced-motion` y el ajuste "Reducir animaciones".
- **Resiliencia**: reintentos con backoff ante 429 de Groq, timeout de 60 s, reconexión MCP,
  recuperación cuando el modelo emite el JSON como tool call `json`, aborto al cerrar la pestaña.
- **Seguridad**: API key solo en `.env`, CSP + nosniff + frame-ancestors, rate limiting 20 req/min,
  validación zod en cada herramienta, `transfer_funds` solo se ejecuta tras un envío explícito del
  formulario (`confirmed` lo fija el backend, no el modelo) con tope de $50,000 MXN por operación. La
  verificación de saldo y el cargo ocurren en el mismo tick dentro del repositorio, así dos
  transferencias concurrentes no pueden sobregirar la cuenta.
- **Limitación conocida (demo)**: el estado bancario vive en memoria y es único para todo el proceso
  (un solo cliente mock). Multiusuario requeriría estado por sesión autenticada.
- **Stack**: Node.js 18+, Express, `@modelcontextprotocol/sdk`, zod, Chart.js (self-hosted) y
  vanilla JS/CSS. Sin build step. Fuentes: Manrope + JetBrains Mono.

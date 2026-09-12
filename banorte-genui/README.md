# Banorte Investments · Norte AI — Reto Banorte 🏦⚡

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
│  Frontend (vanilla│ ◄──────────────────── │   Express    │
│  JS, sin build)   │  POST /api/chat (SSE) │   + Agente   │ ◄──── tool calling ────► Groq LLM
│  dashboard + panel│ ◄──────────────────── │   (Node.js)  │
│  generativo       │                       └──────┬───────┘
└──────────────────┘                              │ MCP (stdio)
                                                  ▼
                                       ┌──────────────────────┐
                                       │ Servidor MCP          │
                                       │ banorte-banking       │
                                       │ 14 herramientas       │
                                       │ (datos mock)          │
                                       └──────────────────────┘
```

1. El dashboard carga sus datos con **una sola llamada** (`/api/dashboard`) que el servidor resuelve
   ejecutando 12 herramientas MCP en paralelo: la misma fuente de verdad que usa el agente.
2. Cada solicitud a Norte AI va a `POST /api/chat` (Server-Sent Events). El agente expone las
   herramientas MCP al LLM (`openai/gpt-oss-120b` en Groq), transmite cada tool call en vivo y
   termina con una **especificación de UI en JSON** que el renderer convierte en DOM seguro.
3. Todo el DOM generado se construye con `createElement`/`textContent` — nunca `innerHTML` con
   contenido del modelo.

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
| `get_portfolio` | Posiciones bursátiles (AAPL, AMZN, MSFT, NVDA), total y distribución |
| `get_watchlist` | Acciones en seguimiento con sparklines (`most_viewed` / `gain` / `lose`) |
| `get_portfolio_performance` | Series históricas deterministas para 1D/1W/1M/6M/1Y |

### Componentes de UI generativos

`header`, `kpi_grid`, `balance_cards`, `chart` (bar/line/pie/doughnut), `table`, `transaction_list`,
`form` (interactivo, reenvía al agente), `alert`, `progress`, `text`.

## Cómo correrlo

```bash
npm install
cp .env.example .env   # y pon tu GROQ_API_KEY
npm start              # http://localhost:3040
```

## App móvil (iOS / Android)

En [`../banorte-mobile`](../banorte-mobile) hay una versión **React Native (Expo)** con el mismo estilo y
funciones que consume este mismo backend (`/api/dashboard`, `/api/simulate-credit` y el stream SSE de
`/api/chat`). El servidor ya responde con CORS para permitirlo. Instrucciones en su README.

## Pruebas

```bash
npm test
```

33 pruebas: 29 unitarias (herramientas bancarias, portafolio, series de rendimiento, compuerta de
confirmación, parseo del JSON del LLM y recuperación de `failed_generation`) + 4 de integración MCP
de extremo a extremo (cliente real → servidor stdio → herramientas).

## Estructura

```
server/
  index.js            Express: /api/dashboard, /api/simulate-credit, /api/chat (SSE), seguridad
  agent.js            Loop de tool-calling con Groq, reintentos, timeout, reparación de JSON
  mcp/server.js       Servidor MCP (stdio) con 14 herramientas validadas con zod
  mcp/client.js       Cliente MCP (subproceso) con reconexión
  mcp/tools.js        Lógica pura de las herramientas
  data/mockData.js    Cliente, cuentas, movimientos, inversiones, divisas, créditos
  data/marketData.js  Posiciones, watchlist y generador determinista de series
public/
  index.html          Dashboard (sidebar, topbar, vistas, panel de IA)
  css/                tokens · layout · components · chart · ai-panel
  js/                 i18n · icons · api · chart · dashboard · views · ai-panel · modals · app
  renderer.js         Renderer de la UI generativa (tema oscuro)
tests/                tools · agent · mcp
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
  formulario (`confirmed` lo fija el backend, no el modelo) con tope de $50,000 MXN por operación.
- **Limitación conocida (demo)**: el estado bancario vive en memoria y es único para todo el proceso
  (un solo cliente mock). Multiusuario requeriría estado por sesión autenticada.
- **Stack**: Node.js 18+, Express, `@modelcontextprotocol/sdk`, zod, Chart.js (self-hosted) y
  vanilla JS/CSS. Sin build step. Fuentes: Manrope + JetBrains Mono.

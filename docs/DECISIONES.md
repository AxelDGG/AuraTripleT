# Decisiones técnicas · Norte AI

> El entregable 04 del reto: diagrama de arquitectura y los tradeoffs de modelo, protocolo e
> infraestructura. Cada decisión trae qué se descartó y por qué. La base técnica está en
> [ARQUITECTURA.md](ARQUITECTURA.md) y el protocolo en [A2UI.md](A2UI.md).

## Arquitectura

```
 Clientes                    API (@norte/api)                 Agente                       Datos y acciones
┌──────────────┐   SSE    ┌──────────────────────┐   tools   ┌──────────────────┐   MCP    ┌─────────────────────┐
│ Web (DOM)    │◄────────►│ POST /api/chat       │◄─────────►│ Groq             │◄────────►│ @norte/mcp-server   │
│ Mobile (RN)  │  a2ui,ui │ POST /api/action     │           │ gpt-oss-120b     │  stdio   │ 16 tools (zod)      │
│ Widget       │          │ GET  /api/a2ui/catalog│          │ prompt A2UI v2   │          │ memory | Tiger Data │
└──────┬───────┘          └──────────┬───────────┘           └──────────────────┘          └─────────────────────┘
       │  runtime compartido         │  @norte/a2ui-schema
       │  (/a2ui/*.js · copia RN)    │  core (sin deps) + messages (zod)
       └─────────────────────────────┘
   lo que la persona toca → dataModel → evento tipado → agente → updateDataModel / nueva superficie
```

## Protocolo: A2UI v1.0 con catálogo propio (no un JSON ad hoc)

**Decisión.** Adoptar el envelope, los cuatro mensajes, la lista de adyacencia, el modelo de datos con
JSON Pointer y las acciones de [A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/), y publicar un
catálogo propio (`urn:norte:a2ui:catalog:banorte:v2`).

**Descartado.** Seguir con Norte UI Spec v1 (arreglo plano, todo literal, acciones como texto). Era
más simple de renderizar, pero no podía transmitir la pantalla por partes, no permitía que un control
recalculara nada sin volver al LLM y no dejaba al agente acomodar el layout. Los tres son criterios
de la rúbrica (adaptabilidad de la UI, calidad de la solución de IA, innovación).

**Descartado.** Usar los renderers oficiales de A2UI (Lit / Angular / Flutter). La regla 1 del reto
exige componentes propios y nuestros clientes son vanilla JS y React Native; la spec está diseñada para
que el cliente ponga su catálogo, así que conformamos con el protocolo y no con su biblioteca.

**Tradeoff aceptado.** El modelo escribe JSON **anidado** y el servidor lo aplana a adyacencia. Los LLM
generan grafos con ids mucho peor que árboles; aplanar en el servidor da conformidad sin pagar fiabilidad.

## Modelo: Groq como orquestador, con un presupuesto de tokens que manda

**Decisión.** `openai/gpt-oss-120b` en Groq por latencia (la interfaz debe aparecer en segundos).

**Costo real que apareció al medir.** El tier *on-demand* de Groq limita a **8 000 tokens por minuto**
por petición y por ventana. Una petición del agente lleva el prompt del sistema + los esquemas de 16
tools (~1 500 tokens) + los resultados de las herramientas + el historial. El primer prompt A2UI
(~4 500 tokens) reventó el límite (`413 Request too large`), y dos turnos seguidos dentro del mismo
minuto reciben `429`. Respuesta:

1. Prompt compacto (~2 800 tokens): firmas en vez de un ejemplo JSON por componente, un solo ejemplo
   completo, catálogo de gráficas en un tercio.
2. El modelo de datos de la superficie activa se resume al mandarlo de vuelta (listas largas
   truncadas).
3. Si el turno falla, el cliente **restaura la pantalla anterior** en vez de dejar el lienzo vacío.
4. **Para la demo, el Dev Tier de Groq (o un segundo API key) es obligatorio** si se van a encadenar
   turnos en menos de un minuto. Sin eso, hay que dejar ~60 s entre la pregunta y "Aplicar plan".

**Agregado después de medir.** Gemini (`gemini-3.6-flash`, API nativa `generateContent` con function
calling) como segundo orquestador, `LLM_PROVIDER=gemini`. Su tier gratis se mide en requests por día
y no en tokens por minuto, así que aguanta turnos encadenados; a cambio tarda ~20 s en generar la
superficie final contra ~5 s de Groq. El proveedor traduce el formato OpenAI del agente en los dos
sentidos y conserva íntegro el turno del modelo (`thoughtSignature` de Gemini 3) para la siguiente
ronda. Medido con Gemini: la ronda final gastaba ~2,300 tokens de razonamiento (13 s) para escribir
~1,000 de JSON; con `thinkingLevel: "low"` (`GEMINI_THINKING_LEVEL`) baja a ~7 s y el turno completo a
~10 s. **Regla para la demo:** Groq si el tier lo permite (velocidad); Gemini si hay que encadenar
pasos sin esperar.

## Streaming: esqueleto + chunks en vez de tool-calls de UI

**Decisión.** El servidor emite un `createSurface` con esqueleto en cuanto el modelo pide herramientas
(ya se sabe qué tipo de pantalla viene) y transmite la superficie final en chunks BFS con 110 ms entre
ellos. La pantalla se construye a la vista.

**Descartado.** Darle al modelo herramientas `ui_create_surface` / `ui_update_components` para que
transmita de verdad mientras razona. Es el modo "incremental puro" de A2UI, pero con un modelo que
además llama tools bancarias el riesgo de superficies a medias era alto y cada tool call extra come
tokens del presupuesto de arriba. Queda como siguiente paso, no como base de la demo.

## Renderer web: reutilizar subárboles y actualizar gráficas en sitio

**Decisión.** Al repintar un contenedor (llegó un hijo nuevo por chunk, cambió una ruta del
dataModel), los hijos cuyo componente no cambió y cuyas dependencias no tocan esa ruta se reutilizan
tal cual; una `Chart` cuyos datos cambian actualiza la instancia de Chart.js en vez de recrear el
canvas, y las instancias de nodos retirados se destruyen. Sin esto cada chunk del streaming y cada
tick del slider reiniciaban la animación de las gráficas y acumulaban instancias.

## Acciones: eventos tipados y autorización en código

**Decisión.** Un `Button`/`Form` manda `{surfaceId, event:{name, context}, dataModel}` a
`POST /api/action`. `transfer_funds` y `restructure_card_debt` solo reciben `confirmed: true` si el
evento está en la lista y su contexto valida con zod (`apps/api/src/actions.js`). El modelo no puede
autorizar dinero, ni antes ni ahora; ahora además la validación es estructural y no un prefijo de texto.

**Conservado.** El canal viejo `[form:transfer_funds] a=1` sigue aceptado: cero regresiones en clientes
sin migrar.

## Runtime: un núcleo sin dependencias, tres consumidores

**Decisión.** `packages/a2ui-schema/src/core` no importa nada (ni zod). La API lo usa como paquete, la
web lo carga como módulos ES desde `/a2ui/*.js` y la app móvil lleva una copia sincronizada con un test
que falla si difiere.

**Descartado.** Meter la app móvil a los workspaces y que Metro resuelva el symlink. Requiere
`watchFolders`/`nodeModulesPaths` y un dev build nuevo; el script de sincronía + test da la misma
garantía sin tocar el build nativo.

**Descartado.** Servir zod al navegador con un import map. La CSP es `script-src 'self'` sin
`unsafe-inline`; un import map inline necesitaría hash o nonce. Los renderers ya son defensivos, así que
la validación fuerte se queda en el servidor.

## Formato de cifras a mano (sin `Intl.NumberFormat`)

**Decisión.** `format.js` arma "$18,400.00", "32.4%" y "$18.4 mil" con strings. Hermes no implementa
`notation: 'compact'` y el resultado tiene que ser idéntico en Node (tests), navegador y teléfono.

## Datos: memoria por defecto, Tiger Data cuando hay `DATABASE_URL`

**Decisión.** La reestructura persiste en memoria el plan completo (`account.plan`) y en Tiger lo que
las columnas existentes permiten (`minimum_payment`, `interest_rate`); el detalle del plan queda en la
superficie archivada en `ui_history`. No se corrió una migración nueva sobre Tiger Cloud a mitad del
reto.

## Lo que no se hizo, a propósito

- `callRendererFunction` / `agentFunctionResponse` (llamadas bidireccionales de la spec): sin caso de
  uso en el flujo y sin peso en la rúbrica.
- Transportes A2A / AG-UI: el transporte es SSE propio, que la spec lista como propuesto.
- El widget de Android sigue abriendo deep links; anunciar un catálogo mínimo y pedir una superficie
  de tamaño widget queda listo del lado del protocolo (`client.components` restringe el prompt) pero
  sin implementar en el widget.

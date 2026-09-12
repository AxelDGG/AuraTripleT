# data/

Datos sintéticos del proyecto. **Nunca datos reales ni PII.**

## `seeds/` — Tiger Data (Postgres + TimescaleDB)

| Archivo | Qué trae |
|---|---|
| `001_schema.sql` | Catálogo del cliente demo, las hypertables `transactions` y `ui_history`, el agregado continuo `spending_by_category_monthly` y los índices. Idempotente. |
| `002_seed.sql` | El cliente demo completo. **Generado** por `packages/mcp-server/scripts/build-seed.js` desde los mocks de `packages/mcp-server/src/data/`, así que no se edita a mano. |

```bash
npm run db:setup       # aplica esquema + seed sobre DATABASE_URL
npm run db:verify      # comprueba que el repositorio `tiger` responde igual que `memory`
npm run db:build-seed  # regenera 002_seed.sql tras cambiar los mocks
```

`ui_history` es el historial de visualizaciones que genera el agente: una fila por interfaz, con la
carpeta que eligió la IA, el título, el prompt que la originó y el Norte UI Spec completo en JSONB.
Es lo que alimenta el carrusel y las carpetas de la web.

## `snowflake/` (pendiente)

DDL, dataset poblacional sintético (miles de clientes, 24 meses), semantic model y scripts Cortex AI
para **benchmarks de pares**.

Ver [README raíz](../README.md), sección "Retos MLH".

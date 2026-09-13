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

## `snowflake/` — capa analítica (benchmarks de pares + Cortex)

| Archivo | Qué trae |
|---|---|
| `001_peer_schema.sql` | DDL de `peer_customers` y `peer_spending`, la vista de percentiles y los ejemplos Cortex (`COMPLETE`, `AI_AGG`, `AI_CLASSIFY`). |
| `peer_customers.csv` / `peer_spending.csv` | Población sintética generada **por `npm run peer:seed`** (gitignore: se regeniran en cada máquina, no se commitan). |

```bash
npm run peer:seed      # genera data/snowflake/peer_*.csv (PEER_SIZE=500 default)
```

Los CSV se cargan con `COPY INTO` (pasos dentro de `001_peer_schema.sql`). **Los mismos datos y la
misma semilla** alimentan el motor local (`packages/mcp-server/src/data/peers.js`): con o sin
Snowflake configurado, la demo devuelve el mismo benchmark. La tool MCP `get_peer_benchmark` lee de
la SQL REST API + `SNOWFLAKE.CORTEX.COMPLETE` cuando `SNOWFLAKE_*` está en el `.env`, y de la
población local si no.

Ver [README raíz](../README.md), sección "Retos MLH".
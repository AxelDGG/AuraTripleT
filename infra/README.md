# infra/

"Develop locally, deploy globally" con **Vultr**: el mismo `docker-compose.yml` corre en la laptop y
en un Vultr Cloud Compute.

| Archivo | Qué es |
|---|---|
| `Dockerfile` | Imagen de `@norte/api` (Node 22 alpine, solo dependencias de producción, corre como `node`). El servidor MCP va dentro como subproceso. Contexto de build: la raíz del monorepo. |
| `docker-compose.yml` | `api` (puerto 3040) + `timescaledb` (Postgres + TimescaleDB, la base operacional de Tiger Data) con healthcheck y volumen persistente. |
| `../.dockerignore` | Excluye `node_modules`, `.env`, tests, docs y mobile de la imagen. |

## Local

```bash
docker compose -f infra/docker-compose.yml up --build
```

La API lee el `.env` de la raíz (`env_file`); el compose no sobreescribe ninguna variable. Para usar el
contenedor local pon `DATABASE_URL=postgres://norte:norte@timescaledb:5432/norte` en `.env`; hoy
la API no lo usa todavía (`BANK_DATA_SOURCE=memory`), queda listo para el repositorio `tiger`.

Solo la imagen, sin base de datos:

```bash
docker build -f infra/Dockerfile -t norte-api .
```

```bash
docker run --rm -p 3040:3040 --env-file .env norte-api
```

## Producción (pendiente)

- `vultr/`: el mismo compose levantando solo `api` (`up -d --no-deps api`) con `DATABASE_URL` de Tiger Cloud,
  Caddy como reverse proxy con HTTPS y GitHub Action que hace `docker compose up -d` por SSH en cada
  push a `main`.
- Vultr Object Storage para las imágenes de recibos (reto Gemini multimodal).

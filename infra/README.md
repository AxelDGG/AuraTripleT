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

## Producción en Vultr

El mismo compose más Caddy delante, y sin TimescaleDB (en producción `DATABASE_URL` apunta a Tiger
Cloud). Esa diferencia de un archivo es literalmente la promesa del reto de Vultr.

### 1. Servidor

Un Vultr Cloud Compute con Docker. Luego, en el servidor:

```bash
git clone <este-repo> /opt/norte-ai && cd /opt/norte-ai
```

Crea el `.env` con `GROQ_API_KEY`, `ELEVENLABS_*`, `DATABASE_URL` (Tiger Cloud) y además:

```bash
NODE_ENV=production
AUTH_SECRET=<64 hex>          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NORTE_DOMAIN=<dominio>
```

**Sin dominio propio** usa [sslip.io](https://sslip.io): para la IP `149.28.10.5` el dominio es
`149-28-10-5.sslip.io`. Resuelve a esa IP sin registrar nada, y como es un nombre válido Let's
Encrypt sí emite certificado — la app móvil habla HTTPS sin tráfico en claro.

### 2. Levantar

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml up -d --build
```

Caddy pide y renueva el certificado solo. `/api/chat` y `/api/voice/*` se proxean con
`flush_interval -1`: sin eso Caddy almacenaría la respuesta y el streaming SSE llegaría de golpe al
final, que es justo lo que no queremos que vea el jurado.

### 3. Despliegue continuo

[`.github/workflows/deploy-vultr.yml`](../.github/workflows/deploy-vultr.yml) corre `npm test`, entra
por SSH y levanta el compose en cada push a `main` que toque la API, los paquetes o la infra. Después
verifica `/api/health` y falla si no responde.

Secretos que hay que crear en el repo (Settings → Secrets → Actions):

| Secreto | Qué es |
|---|---|
| `VULTR_HOST` | IP o dominio del Cloud Compute |
| `VULTR_USER` | Usuario SSH |
| `VULTR_SSH_KEY` | Llave privada con acceso al servidor |
| `VULTR_APP_DIR` | Ruta del repo en el servidor (p. ej. `/opt/norte-ai`) |

### 4. La app móvil

`PUBLIC_API_URL=https://<NORTE_DOMAIN>` al compilar el APK, o se cambia en caliente desde
Servicios → Conexión sin recompilar.

### Pendiente

- Vultr Object Storage para las imágenes de recibos (reto Gemini multimodal).

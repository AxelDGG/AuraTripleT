# infra/ (pendiente)

"Develop locally, deploy globally" con **Vultr**.

- `docker-compose.yml` — dev local: `@norte/api` + TimescaleDB (Tiger Data).
- `vultr/` — el mismo compose en producción (api + Caddy HTTPS) sobre Vultr Cloud Compute,
  Object Storage para imágenes de recibos y GitHub Action de deploy en push a `main`.

Ver [README raíz](../README.md), sección "Retos MLH".

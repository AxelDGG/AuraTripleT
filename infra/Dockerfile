# Imagen de @norte/api (Express + agente + servidor MCP como subproceso).
# Contexto de build: la raíz del monorepo →  docker build -f infra/Dockerfile .
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Solo los manifiestos primero para cachear la instalación de dependencias.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node packages/mcp-server/package.json packages/mcp-server/
COPY --chown=node:node packages/a2ui-schema/package.json packages/a2ui-schema/
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node apps ./apps
COPY --chown=node:node packages ./packages

ENV PORT=3040
EXPOSE 3040
USER node
CMD ["node", "apps/api/src/index.js"]

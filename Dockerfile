# One image recipe for Dokploy (see docker-compose.yml): `api` runs the bundled API, `web` serves the PWA
# with Caddy and proxies /api to it.
FROM oven/bun:1.4.2 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile
ARG VITE_SITE_URL
ENV VITE_API_URL=/api VITE_SITE_URL=$VITE_SITE_URL
RUN cd apps/web && bunx vite build
RUN bun run --cwd apps/api build

# The bundled API needs no node_modules, only Bun. Migrations resolve to /app/drizzle from /app/dist.
FROM oven/bun:1.4.2-slim AS api
WORKDIR /app
COPY --from=build /src/apps/api/dist dist
COPY --from=build /src/apps/api/drizzle drizzle
RUN mkdir /data && chown bun:bun /data
USER bun
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000 DATABASE_PATH=/data/deeznote.db
EXPOSE 3000
CMD ["bun", "dist/index.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/apps/web/dist /srv

FROM alpine:3 AS backup
RUN apk add --no-cache sqlite
COPY deploy/backup.sh /usr/local/bin/backup
CMD ["sh", "/usr/local/bin/backup"]

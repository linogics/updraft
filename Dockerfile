# syntax=docker/dockerfile:1

# ---- deps: install node_modules (incl. Cesium asset copy via postinstall) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

# ---- dev: vite dev server with hot reload (source is bind-mounted by compose) ----
FROM deps AS dev
ENV CHOKIDAR_USEPOLLING=true
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- build: type-check, test, produce static bundle in /app/build ----
FROM deps AS build
COPY . .
RUN npm run postinstall && npm run check && npm test && npm run build

# ---- runtime: unprivileged Caddy serving the static bundle on :8080 ----
FROM caddy:2.11-alpine AS runtime
# Port 8080 needs no privileges. Drop the binary's file capability, otherwise exec fails
# under Kubernetes' `capabilities: drop: [ALL]` with no_new_privs.
RUN apk add --no-cache --virtual .caps libcap-utils  && setcap -r /usr/bin/caddy  && apk del .caps  && chown -R 65532:65532 /data /config
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv
# Runtime config, served as /config.json by the Caddyfile.
ENV CESIUM_ION_TOKEN=""
USER 65532:65532
EXPOSE 8080

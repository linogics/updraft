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

# ---- runtime: unprivileged nginx serving the static bundle on :8080 ----
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html
# Runtime config, rendered into /config.json by nginx's envsubst template step.
ENV CESIUM_ION_TOKEN=""
EXPOSE 8080

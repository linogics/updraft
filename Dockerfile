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

# syntax=docker/dockerfile:1

# Automigrate is off, so dashboard changes do not write migration files into the mounted repo folder.
# PocketBase has no official image, so this one fetches the pinned release and checks it.
FROM alpine:3.22 AS fetch
ARG PB_VERSION=0.40.6
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl
WORKDIR /tmp
RUN set -eu; \
    zip="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"; \
    base="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    curl -fsSLO "$base/$zip"; \
    curl -fsSLO "$base/checksums.txt"; \
    grep " $zip\$" checksums.txt | sha256sum -c -; \
    unzip "$zip" pocketbase

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=fetch /tmp/pocketbase /usr/local/bin/pocketbase
EXPOSE 8090
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--automigrate=false"]

# Paragliding Replay

Web app that replays IGC flight logs in 3D and analyses them: thermals, glides, flight stats and side-by-side comparison of several pilots. Inspired by skyviz.io, ogoy.app, flyxc.app and xcfinder.com.

## Features (V1)

- Import one or more `.igc` files (drag and drop). Flights are stored in the browser (IndexedDB).
- 3D replay on CesiumJS: tracks coloured by vario, flight phase or pilot; live pilot markers with trail.
- Camera modes: follow (smoothed chase cam), cockpit, orbit, free.
- Player: play/pause, 1×–200× speed, scrubbing, jump to the next thermal, keyboard (space, ←/→).
- Altitude chart for all pilots with phase bands of the selected pilot; click or drag to seek.
- Flight analysis: thermalling / gliding / searching phases, thermal list (gain, average climb, duration), stats (distance, altitudes, max climb/sink, glide ratio).
- Multi-pilot replay on a shared clock.
- Layouts: 3D, 2D map (MapLibre), or split view.
- 3D terrain without any account (AWS Terrain Tiles); Cesium World Terrain when an ion token is configured. Terrain dropdown: ion, free tiles, or flat.
- Base maps: satellite (Esri), topo (OpenTopoMap) or OSM with hillshade, in 3D and 2D.
- Timeline for flights from different days, similar to a video editor: one clip per pilot, drag clips to shift them in time (snapping to other clips and the playhead, Alt disables it), Ctrl+wheel to zoom. Quick alignment: real time, same day (keeps time of day) or aligned takeoffs. The alignment is stored in the URL.
- Demo flights to try the app without own files.

## Running locally (Docker only, no Node on the host)

```sh
# Development with hot reload on http://localhost:5173
docker compose up dev

# Tests and type check
docker compose run --rm dev npm test
docker compose run --rm dev npm run check

# Production image (Caddy) on http://localhost:8080
docker compose --profile prod up --build web
```

`node_modules` lives in a Docker volume, so editors on the host will not resolve imports. After changing `package.json`, run `docker compose run --rm dev npm install`.

### Terrain and maps

| Terrain source | Needs | Notes |
|---|---|---|
| AWS Terrain Tiles (default without token) | nothing | Free global elevation (Terrarium PNG, SRTM and national DEMs), up to zoom 15 |
| Cesium World Terrain (default with token) | free [Cesium ion](https://ion.cesium.com) token | Higher resolution. Set `CESIUM_ION_TOKEN` in `.env` (copy `.env.example`). If ion fails, the app falls back to AWS Terrain Tiles |
| Flat | nothing | Ellipsoid, no relief |

Each track is shifted vertically so takeoff sits on the ground (at most ±150 m). This compensates for loggers that record a different height reference than the terrain.

The keyless tile services (AWS Terrain Tiles, Esri World Imagery, OpenTopoMap, OpenStreetMap) require attribution, which the map shows. They are meant for moderate traffic. For heavy public use, self-host tiles or switch to a keyed provider (for example MapTiler). The sources are configured in `src/lib/map/basemaps.ts`.

## Kubernetes

The runtime image is [Caddy](https://caddyserver.com) (`caddy:2.11-alpine`, config in `deploy/caddy/Caddyfile`) serving the static build on port 8080. It runs as uid 65532 with a read-only root filesystem and no capabilities, and exposes `/healthz` for probes. Configuration is read at runtime from `/config.json`, which Caddy fills from environment variables per request. One image therefore serves every environment. TLS is left to the ingress.

```sh
docker build --target runtime -t <registry>/paragliding-replay:<tag> .
docker push <registry>/paragliding-replay:<tag>

kubectl create secret generic paragliding-replay --from-literal=cesium-ion-token=<token>   # optional
cd deploy/k8s && kustomize edit set image paragliding-replay=<registry>/paragliding-replay:<tag>
kubectl apply -k deploy/k8s
```

Edit the host and ingress class in `deploy/k8s/ingress.yaml` before applying (`ingressClassName: nginx` refers to the cluster's ingress controller, not to the app image).

## Architecture

```
src/lib/
  domain/     framework-free TypeScript: IGC parsing, analysis, timeline, scene config (unit tested)
  storage/    FlightRepository interface + IndexedDB implementation
  cesium/     3D viewer, terrain providers, flight layer, camera modes
  map/        shared tile sources (base maps, terrain)
  state/      replay state (Svelte runes) incl. the replay clock
  components/ Svelte UI
  ui/         colour scales and formatting
```

The dependency direction is `domain → storage / cesium / ui`. The domain layer has no browser or framework imports, so the same code can run on a server later.

## Prepared for a backend (next iteration)

- `FlightRepository` (`src/lib/storage/repository.ts`): add an HTTP implementation and switch it in `src/lib/storage/index.ts`.
- Domain types are plain JSON and the analysis functions are pure, so they can run on the server unchanged.
- The replay view is fully described by `SceneConfig` in the URL. It can become a stored scene behind a share link.
- Flight IDs are UUIDs.
- Runtime config comes from `/config.json`, so an API base URL can be added there.
- To add server routes, switch the SvelteKit adapter from `adapter-static` to `adapter-node`.

## Roadmap

See [docs/feature-gaps.md](docs/feature-gaps.md) for a comparison with skyviz.io, ogoy.app, flyxc.app and xcfinder.com.

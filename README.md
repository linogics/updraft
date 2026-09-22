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
- Demo flights to try the app without own files.

## Running locally (Docker only, no Node on the host)

```sh
# Development with hot reload on http://localhost:5173
docker compose up dev

# Tests and type check
docker compose run --rm dev npm test
docker compose run --rm dev npm run check

# Production image (nginx) on http://localhost:8080
docker compose --profile prod up --build web
```

`node_modules` lives in a Docker volume, so editors on the host will not resolve imports. After changing `package.json`, run `docker compose run --rm dev npm install`.

### Terrain (optional)

Real 3D terrain and satellite imagery need a free [Cesium ion](https://ion.cesium.com) token. Copy `.env.example` to `.env` and set `CESIUM_ION_TOKEN`. Without a token, the globe is flat with OpenStreetMap imagery. With terrain, each track is shifted vertically so takeoff sits on the ground (at most ±150 m), which compensates for loggers that record MSL instead of ellipsoidal heights.

## Kubernetes

The runtime image is static nginx (`nginxinc/nginx-unprivileged`) on port 8080. It runs as a non-root user with a read-only root filesystem and exposes `/healthz` for probes. Configuration is read at runtime from `/config.json`, which nginx renders from environment variables. One image therefore serves every environment.

```sh
docker build --target runtime -t <registry>/paragliding-replay:<tag> .
docker push <registry>/paragliding-replay:<tag>

kubectl create secret generic paragliding-replay --from-literal=cesium-ion-token=<token>   # optional
cd deploy/k8s && kustomize edit set image paragliding-replay=<registry>/paragliding-replay:<tag>
kubectl apply -k deploy/k8s
```

Edit the host and ingress class in `deploy/k8s/ingress.yaml` before applying.

## Architecture

```
src/lib/
  domain/     framework-free TypeScript: IGC parsing, analysis, timeline, scene config (unit tested)
  storage/    FlightRepository interface + IndexedDB implementation
  cesium/     3D viewer, flight layer, camera modes
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

Video export, accounts and share links, logbook with XContest import, airspaces (openAIP), XC scoring and route planner with XCTrack/SeeYou export, thermal heatmap from many flights, live tracking.

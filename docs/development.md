# Development

How to run the app is described in the [README](../README.md). This page covers the code structure and deployment details.

## Architecture

```
src/lib/
  domain/     framework-free TypeScript: track formats, analysis, timeline, scene config (unit tested)
  storage/    FlightRepository interface, IndexedDB implementation, backup
  cesium/     3D viewer, terrain providers, flight layer, camera modes
  map/        shared tile sources (base maps, terrain)
  airspace/   openAIP tiles and styling
  thermals/   kk7 hotspot and skyway overlay
  xc/         XC scoring in a Web Worker
  demo/       demo flights
  export/     PNG and MP4 rendering
  state/      replay state and browser preferences (Svelte runes)
  components/ Svelte UI
  ui/         colour scales and formatting
messages/     UI strings for English, German and French (Paraglide)
```

The dependency direction is `domain → storage / cesium / ui`. The domain layer has no browser or framework imports, so the same code can run on a server later.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: check, test, build, then deploy `build/` to GitHub Pages at https://updraft.linogics.io (`static/CNAME`).

One-time setup: in the repository settings set Pages source to "GitHub Actions", custom domain `updraft.linogics.io` and enforce HTTPS. In DNS add `CNAME updraft -> linogics.github.io`.

## Prepared for a backend

- `FlightRepository` (`src/lib/storage/repository.ts`): add an HTTP implementation and switch it in `src/lib/storage/index.ts`.
- Domain types are plain JSON and the analysis functions are pure, so they can run on the server unchanged.
- The replay view is fully described by `SceneConfig` in the URL. It can become a stored scene behind a share link.
- Flight IDs are UUIDs.
- Runtime config is read by `loadRuntimeConfig` (`src/lib/config.ts`), so an API base URL can be added there.
- To add server routes, switch the SvelteKit adapter from `adapter-static` to `adapter-node`.

## Performance

Two manual benchmark suites, not run in CI because runner timing is noisy:

- `npm run bench`: domain code on a synthetic 8 h flight (28 801 fixes at 1 Hz), in `src/lib/bench/`.
- `npm run bench:ui`: Playwright timing of import, play, seek and a logbook with 300 flights, in `e2e/perf.spec.ts`. Run it headed on a machine with a GPU: `npm run bench:ui -- --headed`. Headless Chromium and machines without a GPU render WebGL on the CPU, then frame times are meaningless. The play test prints the WebGL renderer it got.

Budgets: import and analysis of an 8 h flight under 1 s, frames under 16 ms, main-thread tasks under 50 ms, UI response under 100 ms. A test fails when its budget is broken.

Baseline from 2026-11-23 (container without GPU):

| Step | Time |
|---|---|
| readIgc | 74 ms |
| analyzeFlight | 64 ms |
| smoothPath | 39 ms (was 58 ms) |
| writeGpx / writeIgc | 80 / 55 ms |
| Import 8 h flight until replay ready | 3.9 s, longest task 0.6 s (was 6.3 s and 2.3 s) |
| Logbook with 300 flights, list ready | 0.4 s |


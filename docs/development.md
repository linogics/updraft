# Development

How to run the app is described in the [README](../README.md). This page covers the code structure and deployment details.

Open the dev server as http://localhost:5173, not http://127.0.0.1:5173, because the kk7 thermal tiles reject 127.0.0.1.

## Architecture

```
src/lib/
  domain/     framework-free TypeScript: track formats, analysis, timeline, scene config (unit tested)
  storage/    IndexedDB flight repository, backup
  cesium/     3D viewer, terrain providers, flight layer, camera modes
  map/        shared tile sources (base maps, terrain)
  airspace/   openAIP tiles and styling
  thermals/   kk7 hotspot and skyway overlay
  xc/         XC scoring in a Web Worker
  demo/       demo flights
  export/     PNG and MP4 rendering
  state/      studio state and browser preferences (Svelte runes)
  components/ Svelte UI
  ui/         colour scales and formatting
messages/     UI strings for English, German and French (Paraglide)
```

The dependency direction is `domain → storage / cesium / ui`. The domain layer has no browser or framework imports, so the same code can run on a server later.

## Deployment

Pushing a `v*` tag runs `.github/workflows/deploy.yml`: check, test, build, then deploy `build/` to GitHub Pages at https://updraft.linogics.io (`static/CNAME`). `gh release create vX.Y.Z` pushes the tag. Merges to `main` do not deploy. To redeploy a version, run the workflow by hand and pick its tag.

One-time setup: in the repository settings set Pages source to "GitHub Actions", custom domain `updraft.linogics.io` and enforce HTTPS. In the `github-pages` environment allow only tags matching `v*` to deploy. In DNS add `CNAME updraft -> linogics.github.io`.

## Prepared for a backend

- Domain types are plain JSON and the analysis functions are pure, so they can run on the server unchanged.
- The studio view is fully described by `SceneConfig` in the URL. It can become a stored scene behind a share link.
- Flight IDs are UUIDs.
- Runtime config is read by `loadRuntimeConfig` (`src/lib/config.ts`), so an API base URL can be added there.
- To add server routes, switch the SvelteKit adapter from `adapter-static` to `adapter-node`.

## Sync

Local-first: IndexedDB stays the main copy and `SyncEngine` (`src/lib/sync/engine.svelte.ts`) mirrors it to a server that speaks the [sync spec v2](server/README.md). The typed HTTP client is `src/lib/sync/v2/http.ts`. The app-wide `syncClient` (`src/lib/sync/client.svelte.ts`) holds the server address and the session, signs in and runs the engine.

- A flight is stored as metadata (the summary, `hasTrack`, `clubs`, `club`), its track (`tracks`) and the imported file (`originals`). The synced item `data` is the metadata. Manual entries are flights with `hasTrack: false`.
- Every repository write marks the item dirty in the `sync` store (`collection:id`) and sets `times[field]` for each changed field. XC scores are a cache and never sync.
- A run goes through `flights`, `camera-paths` and `prefs`. Each collection is pulled from its stored cursor, page by page, then the dirty items are pushed. A create sends `If-None-Match: *`, an update `If-Match` with the stored version. On a 412 the server's item is merged field by field (`src/lib/sync/merge.ts`, newer time wins, a tie keeps the remote value) and the write is tried again. A delete wins over a conflict.
- After a flight item is stored, the original file and the parsed `track.json` are uploaded once. A pulled flight shows in the logbook from its metadata, its fixes are fetched on first use.
- Prefs in localStorage are detected after the prefs pull by comparing the raw value with the last one seen. A pref the server never gave a copy of is sent with time 0, so it cannot beat the server copy. Remote prefs apply after a reload. `studioLayout` and the plugin list never sync, API keys only when `syncKeys` is `'1'`.
- `start()` syncs on start, on `focus`, on `online` and 3 s after a local change. `stop()` removes the listeners.
- Tests run the engine and client against `createMemoryServer` (`src/lib/sync/v2/memory-server.ts`), the e2e tests serve it through `page.route`.

The server contract is [server/openapi.yaml](server/openapi.yaml), explained in the [sync server guide](server/README.md). The PocketBase reference server in `server/` is described in [self-hosting-sync.md](self-hosting-sync.md).

### Known limits

Each one is fine for a club-sized server and marked with a `shortcut:` comment in the code.

- Last write wins compares `updatedAt` from each device's own clock. A device with a wrong clock can win or lose against newer changes.
- Synced prefs are written to localStorage and apply only after a reload.
- After the server rejects the token, the panel still shows the account until sign out, sync reports the error.
- Signing in with another account on the same device uploads all local records to that account, the device's data is not split per account.
- Club free distance uses the XC route only when the best scored route is a free route. When a triangle scores best, the furthest point from takeoff is used, so the free distance can be too short.
- The club pilot filter is page state and is lost on reload.

Not yet tested end to end: sharing and the club page against a real server (the server is covered by the contract suite, the UI only against a mocked server), a second pilot opening a shared flight, the side menu at phone width.

### Possible next steps

- Apply synced prefs live instead of after a reload.
- Warn before uploading local data to a different account, or offer to clear the device first.
- Score free distance separately for the club rankings.
- Keep the club tab and pilot filter in the URL.

## Performance

Two manual benchmark suites, not run in CI because runner timing is noisy:

- `npm run bench`: domain code on a synthetic 8 h flight (28 801 fixes at 1 Hz), in `src/lib/bench/`.
- `npm run bench:ui`: Playwright timing of import, play, seek and a logbook with 300 flights, in `e2e/perf.spec.ts`. Run it headed on a machine with a GPU: `npm run bench:ui -- --headed`. Headless Chromium and machines without a GPU render WebGL on the CPU, then frame times are meaningless. The play test prints the WebGL renderer it got.

Budgets: parse and store of an 8 h flight under 1 s, studio page ready under 2 s after that, frames under 16 ms, main-thread tasks under 50 ms, UI response under 100 ms. A test fails when its budget is broken.

Baseline from 2026-11-23 (container without GPU):

| Step | Time |
|---|---|
| readIgc | 74 ms |
| analyzeFlight | 64 ms |
| smoothPath | 39 ms (was 58 ms) |
| writeGpx / writeIgc | 80 / 55 ms |
| Import 8 h flight until studio ready | 3.9 s, longest task 0.6 s (was 6.3 s and 2.3 s) |

Measured headed on an Apple M3 Max (2026-11-23), all within budget: parse and store 36 ms, studio page ready 0.7 s, play frame p95 7 ms, seek p50 14 ms, logbook list 82 ms.
| Logbook with 300 flights, list ready | 0.4 s |


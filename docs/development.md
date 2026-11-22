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

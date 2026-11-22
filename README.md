# updraft

Web app for paraglider and hang glider pilots. Replay flight logs in 3D, analyse thermals and glides, score XC flights and keep a logbook, all in the browser.

Live at https://updraft.linogics.io

## Features

- **3D and 2D replay** of one or many pilots on a shared clock, with a video-editor style timeline, camera modes and keyframed camera paths.
- **Flight analysis and XC score**: thermals, glides and flight stats, scored for XContest, FFVL, FAI or UK XC League.
- **Video export and route planner**: render the replay as an MP4 or PNG with overlays, draw and share XC routes with thermal hotspots and airspaces.
- **Logbook and backup**: totals and breakdowns, flights without a track, one-file backup of everything.
- **Local-first, no account**: flights stay in your browser. Imports IGC, GPX, KML, FIT, TRK and GeoJSON. Installable as an app, in English, German and French.

All features are listed in [docs/features.md](docs/features.md). How to use the app is described in [docs/help.md](docs/help.md).

## Local development

Docker only, no Node on the host.

```sh
# Development with hot reload on http://localhost:5173
docker compose up dev

# Tests and type check
docker compose run --rm dev npm test
docker compose run --rm dev npm run check

# Static build into build/
docker compose run --rm dev npm run build
```

`node_modules` lives in a Docker volume, so editors on the host will not resolve imports. After changing `package.json`, run `docker compose run --rm dev npm install`.

Code structure and notes for a future backend are in [docs/development.md](docs/development.md).

## Hosting

The app is a static site with no backend. Build it, then serve `build/` from any static host and answer unknown paths with `404.html`.

The official instance deploys on every push to `main` through `.github/workflows/deploy.yml` (check, test, build, deploy to GitHub Pages).

The keyless tile services (AWS Terrain Tiles, Esri World Imagery, OpenTopoMap, OpenStreetMap) are meant for moderate traffic. For heavy public use, self-host tiles or switch to a keyed provider. The sources are configured in `src/lib/map/basemaps.ts`.

## License

[BSD 3-Clause](LICENSE)

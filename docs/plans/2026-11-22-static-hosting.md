# Plan: ship as a static site on GitHub Pages

The app is already a client-only SPA (`adapter-static`, `ssr = false`). No WASM is needed. Goal: publish the static build at `https://updraft.linogics.io` with no server to run.

## Decisions

| Topic | Decision |
|---|---|
| Host | GitHub Pages, deployed by GitHub Actions |
| URL | `updraft.linogics.io` at the domain root, so no base path changes |
| Cesium ion token | Each user enters their own token. It is kept in `localStorage`, not in the bundle |
| Old deploy | Keep the Docker `dev` service. Remove Caddy, Kubernetes and the production image |
| CI | Push to `main` (incl. merges) runs check, test, build, deploy. Failure blocks the deploy |
| Tiles | Keep the keyless tile services. CORS is fine, usage policy risk is accepted for now |

## Steps

1. `vite.config.ts`: SPA fallback `404.html` (Pages serves it for unknown paths such as `/replay?...`). Remove the dev `/config.json` middleware. Prerender the route shells (`index.html`, `replay.html`) so `/` and `/replay` answer 200.
2. `src/lib/config.ts`: read the ion token from `localStorage`, add `saveIonToken`.
3. `Toolbar.svelte`: "Ion token" popover with an input. Saving stores the token and reloads, so the viewer starts with it.
4. `static/CNAME` with `updraft.linogics.io`.
5. `.github/workflows/deploy.yml`: Node 24, `npm ci`, check, test, build, upload `build/`, deploy to Pages.
6. Remove `deploy/`, `.env.example`, the Dockerfile build and runtime stages and the compose `web` service.
7. README: hosting and token sections.

## Manual setup (outside the repo)

- Repo settings, Pages: source "GitHub Actions", custom domain `updraft.linogics.io`, enforce HTTPS.
- DNS: `CNAME updraft -> linogics.github.io`.
- Optional: restrict personal ion tokens to `updraft.linogics.io` in the ion dashboard.

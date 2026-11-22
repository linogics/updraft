# UI overhaul: decisions and open tasks

Agreed on 2026-11-22. Shipped as a series of small PRs, each merged before the next starts.

## Decisions

| Topic | Decision |
|---|---|
| Entry point | `/` is a dashboard with one tile per tool: Replay, Logbook, Convert, XC planner. Tiles show live numbers from the saved flights. |
| Navigation | The logo links back to the dashboard. No other tool switcher. |
| Look | Dark "flight instrument" style. Yellow `--needle` accent for focus, progress and the main action. Barlow Condensed for headings and readouts. Replay stays map-first. |
| Logbook | Owns the flight library: import, table, pick flights to replay. Adds totals and breakdowns per year, month, site and glider, charts, manual entries without IGC, editable fields and notes. Everything stays in the browser (IndexedDB). |
| Backup | Export and import of the whole app (flights, camera keys, prefs). The Cesium ion token is only included when a checkbox is ticked, off by default. On import the user picks merge or replace. |
| Converter | Reads IGC, GPX, FIT, KML, TRK and GeoJSON. Writes IGC (unsigned, no G record), GPX, KML and GeoJSON. FIT is parsed with `fit-file-parser`. Converted tracks are saved to the logbook like IGC flights, with GPS altitude only. |
| XC planner | Tile only, marked as planned. No code yet. |
| Loading feedback | First replay load shows a staged screen with step labels. Page navigation shows a thin top bar. 3D loading notices show a sweep bar. |
| Panels | Replay side panel, bottom panel and 3D/2D split are resizable by drag or arrow keys, collapse with the chevron or Enter, reset on double-click. Sizes are stored per browser. No resizing on phones. |
| Auto director | Density setting low, mid, high. Low means about two keys per flight phase. |
| Delivery | 1 dashboard and loader, 2 resizable panels, 3 director density, 4 converter, 5 logbook and backup. |

## Progress

| Step | State |
|---|---|
| 1 Dashboard, logbook route, staged loader | merged (#8) |
| 2 Resizable panels | merged (#9) |
| 3 Director density | merged (#10) |
| 4 Converter and formats | merged (#11) |
| 5 Logbook and backup | open |

## Open tasks

- Switching the selected pilot in replay can lag without feedback. Not measured yet, profile first.
- The staged load screen was only seen briefly with the demo flights. Check with many or large flights.
- TRK reader follows the CompeGPS layout from memory and treats times as UTC. Check against real files.
- KML only reads `gx:Track`. A LineString with `TimeStamp` placemarks is rejected.
- GPX and KML are read with regex helpers, not DOMParser, so CDATA and unusual namespaces are not handled.
- The convert page drop zone still says files from the same day are replayed together.
- "Download all" starts one download per file. Browsers may ask before allowing many downloads. A zip would avoid that.
- The collapse chevron sits inside the ARIA separator, so screen readers do not list it. Enter on the separator does the same.
- Update README and `docs/feature-gaps.md` once the series has landed.
- XC planner: route, scoring and task export, later.

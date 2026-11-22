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
| XC planner | `/plan`: free-draw route on a 2D map, distance, XC score per league, duration estimate, share link in the URL. |
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
| 5 Logbook and backup | merged (#12) |

## Open tasks

- TRK reader follows the CompeGPS layout from memory and treats times as UTC. Check against real files.
- Switching the selected pilot was profiled with three 6 h flights at 1 Hz in headless Chrome. Our JS takes about 50 ms per switch, the rest is native rendering and terrain tiles under software GL. Check on a real GPU before optimising.
- Restored settings (units, thermal toggles, panel sizes) apply after a reload. The restore message has a Reload now button.
- XC planner: task export (xctsk, cup), airspaces and turnpoint cylinders, later.

## Closed follow-ups

- Staged load screen checked with three 6 h flights: all steps show, about 1 s in total (#15).
- KML reads Placemarks with Point and TimeStamp besides `gx:Track`. GPX and KML readers ignore namespace prefixes and unwrap CDATA (#14). Still regex based, no DOMParser, so tests run in node.
- Convert drop zone hint, splitter chevron listed by screen readers, slim bars with one year, zip for Download all (#13).
- Manual entries show a dash for distance and max altitude. Kept on purpose, there is no track.

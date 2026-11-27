# Features

Everything updraft can do today, grouped by area. A short guide to using it is in [help.md](help.md).

## Start page

- Two columns: a sticky sidebar with navigation on the left, the full logbook on the right. The logbook is the start page, there is no separate logbook route.
- Sidebar entries: Studio (opens the last saved flight, disabled while there is none), Converter and XC planner. Language and help sit at the bottom of the sidebar.
- On narrow screens (800 px and below) the sidebar is a navigation drawer. Open it with the menu button, swipe it away, tap outside, press Escape or use the close button.
- Pages fade into each other when you navigate, unless reduced motion is requested.
- Demo flights to try the app without own files.

## Import and formats

- Drag and drop one or more files: IGC, GPX, KML (`gx:Track`), FIT, CompeGPS TRK or GeoJSON.
- Flights are stored in the browser (IndexedDB). Several files from the same day are opened together.
- Converter (`/convert`): write any imported track as IGC (unsigned), GPX, KML or GeoJSON, one file or all at once, optionally also saved to the logbook.

## Studio

- 3D view on CesiumJS, 2D map (MapLibre) or a split view of both. Panels are resizable and collapsible, sizes are kept per browser.
- Dockable panels: pilots, climbs, XC, stats, export, scene, track, settings, altitude chart and timeline live in a left, right or bottom dock. Drag a panel by its grip into any dock, also an empty one, or move it from its actions menu (the keyboard alternative), hide it, or bring it back from the toolbar Panels button. The altitude chart and timeline stay in the bottom dock. Hidden panels are not even loaded, and they do not run their work either: XC scoring and ground heights only run while a panel or an export needs them. Click a side panel's title to collapse it to its header. XC and Settings start hidden, turn them on from the Panels menu. The layout is kept per browser.
- Plugin panels: add your own panel from the Panels menu with the URL of a plain JavaScript module. A plugin is loaded only while its panel is shown, gets read access to the flights, the playback time and the 3D viewer, and can draw an overlay over the views. Plugins run with full access to the page, so only add ones you trust. They are kept per browser and work offline once added, if the file is served with CORS and was reachable when you added it. A plugin can also draw into image and video exports, each one gets its own checkbox in the export dialogs. Authors find the details in [plugins/README.md](plugins/README.md).
- Several pilots on one shared clock, with live markers, trail and pilot names.
- Player: play and pause, 1× to 200× speed, scrubbing, jump to the next thermal, keyboard control.
- Timeline like a video editor: one clip per pilot, drag clips to shift them in time with snapping, Ctrl+wheel to zoom. Quick alignment: real time, same day (keeps time of day) or aligned takeoffs. Works for flights from different days.
- Altitude chart for all pilots with phase bands of the selected pilot. Click or drag to seek.
- Pilot list with altitude and height above ground (AGL).
- Add pilots without leaving the studio: the "Add pilot" button opens a picker over the logbook (filter, multi-select, import files), or drop track files anywhere on the page.
- Track colour by vario, flight phase, climb and transition, or pilot. Any pilot colour can be picked.
- Track style: solid, outline, dashed, curtain (3D wall down to the ground) or glow, width 1 to 10 px, smoothing (on by default).
- Scene panel with the view toggles: pilot names, height exaggeration 1× to 3×, sun lighting at the recorded time, thermal columns and labels. A full screen button sits in the toolbar.
- Terrain: free AWS Terrain Tiles, Cesium World Terrain with your own ion token, or flat. Each track is shifted so takeoff sits on the ground (at most ±150 m).
- Base maps: satellite (Esri), topo (OpenTopoMap) or OSM with hillshade, in 3D and 2D.
- Thermal hotspots and skyways from thermal.kk7.ch, in 2D, 3D and the planner.
- Airspaces from openAIP with your own free key, filtered by class and floor. Click for details in 2D, translucent volumes in 3D.
- The studio view (flights, layout, track style, filters, alignment) lives in the URL, so a link restores it in the same browser.
- Staged load screen while the studio opens.

## Camera

- Modes: follow (smoothed chase cam), cockpit, orbit, free and keys.
- Keys mode: heading, pitch and range each have a lane in the timeline. Add, move, copy, paste and delete keys, with auto, linear, hold or ease interpolation. Undo and redo cover every edit.
- "Capture view" keys the current 3D camera at the playhead.
- "Auto" builds a shot list from the flight phases (establishing shot, chase on glides, orbits in thermals, pull-back), with low, mid or high key density.
- Keys are stored per set of flights in this browser.

## Flight analysis

- Phases: thermalling, gliding and searching, with the time share per phase.
- Thermal list with gain, average climb, duration and top altitude. Thermals are coloured by climb strength.
- Thermal filter by minimum gain and minimum average climb. It applies to the list, the map, the timeline and "next thermal".
- Transitions between the remaining thermals (launch, glide, final glide) with distance, altitude loss, glide ratio and speed.
- Stats: distance, takeoff and landing, altitudes, max climb and sink, glide ratio, speed made good, average leave and arrival altitude of climbs, lowest arrival.
- Transition altitudes in MSL or AGL.

## XC scoring

- Own XC panel in the studio: league, type (free distance, flat triangle, FAI triangle, out and return), distance, multiplier and points.
- Leagues: XContest, FFVL, FAI (also with cylinders and two out-and-return variants) and UK XC League.
- Points list when several pilots are loaded. The scored route is drawn in 2D and 3D, with the closing circle for triangles.
- "Make route" turns a flight into 1 to 30 turnpoints and opens them in the planner.

## Route planner

- `/plan`: click the map to add points, drag to move, click a leg midpoint to insert, undo and clear.
- Total and per-leg distance, XC score per league and a duration estimate from a speed in km/h.
- Route and speed live in the URL, "Copy link" shares it.
- Download the route as an XCTrack task (`.xctsk`, 400 m cylinders) or a GPX route for other instruments.
- Thermal overlay and airspaces on the planner map.
- Below the route controls the sidebar holds panels in one column: Thermal overlay, XC score, Airspace and Legs (only while the route has legs). Drag them by the grip, fold them or use the actions menu (Move up, Move down, Reset layout). They start folded except Legs. The layout is kept in this browser.
- XC score has its own on/off switch, shared with the studio. While it is off nothing is scored.
- Plugins whose `hosts` include `plan` appear after the bundled panels. They can be removed, shown again and uninstalled from the Panels menu next to the title, where plugins are also added.
- The controls sit in a sidebar on the left. On phones the map fills the screen and the controls open from the menu button as a swipeable drawer.

## Logbook

- `/`: every saved flight with totals, hours per month and per year, breakdown by year, site or glider.
- Editable pilot, site, glider and notes. Flights entered by hand without a track.
- XC type and points per flight and in total, scored in the background for the chosen league.
- Pick flights and open them together in the studio.
- Achievements panel: 15 tiered badges (Bronze to Legend) such as free distance, XC speed, longest flight, total airtime, max altitude and gain, sites and triangles. One card per badge shows the value in your units, the progress to the next tier, the date the tier was reached and a link to the flight that set it. Every track flight counts, manual entries and the demo flights do not. Badges are computed on the fly, only the per-flight figures are cached in this browser. Height above ground counts only for flights shared with the club, because terrain is not fetched for the whole logbook. Badge plugins are added and removed in the panel.
- Panels like in the studio: Charts, Achievements, Flights and Breakdown in the main column, Upload, Sync and Backup in the side column (first on phones). Drag a panel by its grip or use its actions menu to move it between columns, click its title to fold it, or reset the layout. Sync, Backup and Breakdown start folded. The layout is kept per browser.

## Export

- PNG of the current 3D frame in 16:9, 9:16 or 1:1, with flight data, altitude graph, stats, minimap and map credits, each optional.
- MP4 video (H.264) in 16:9, 9:16 or 1:1 at 720p, 1080p, 4K or a custom size, 30 or 60 fps, three quality levels. In and out marks, a target length or a speed factor, optional music. Camera keys apply.

## Backup

- Export everything this browser keeps (flights, manual entries, camera keys, settings) to one JSON file. API keys only on request.
- Restore by merging with or replacing the data in this browser.

## Sync

- Optional, local-first sync of flights, manual entries, camera keys and settings through a server you host (bundled PocketBase backend, or a backend plugin).
- Password and OAuth sign in, automatic sync after changes and on focus, "Sync now", newest change wins per record.
- API keys sync only on request. Layout and plugin list stay per device.
- A hosted app can preset the server with `/config.json`.

## Club

- Opt-in sharing per flight with everyone on the same sync server, and unsharing again.
- Club page with all-time rankings (gold, silver, bronze) in eleven categories and a list of shared flights.
- Badges tab: every pilot with shared flights and a medal per badge reached (Bronze or better, from your installed badge plugins), sorted by badge score. Only shared flights count.
- Shared flights open read-only in the studio, nothing is saved locally.

## Settings and app

- Units: metric, imperial or aviation preset, or each unit on its own (distance, altitude, vario, speed).
- Languages: English, German and French. Defaults to the browser language.
- Installable app (PWA). The logbook, converter and stored flights work offline. Map tiles, terrain and 3D assets need the network.
- Update banner when a new version is deployed.
- On Chromium the installed app opens track files from the desktop.

## Not implemented

### Possible in the browser

- Loading tracks by URL and importing XCTrack tasks (`.xctsk`).
- More task and waypoint export: a QR code for `.xctsk`, SeeYou `.cup`, XCSoar `.tsk`, KML, FormatGEO.
- Type, month and time-of-day filters for the thermal hotspots.
- Exact airspace limits: flight levels and AGL ceilings are treated as MSL, GND floors start at 0 m, FIR and UIR are skipped.
- Airspaces in the altitude chart.
- National topo maps such as IGN France (incl. the OACI chart) and IGN Spain.
- Altitude chart switch to speed or vario, ground elevation fill, wheel zoom.
- Place search and "my location".

### Needs a backend

- Accounts and cloud storage run by the app itself.
- XContest import.
- Public shareable scenes, latest scenes and rankings.
- Flight database search by area, takeoff, landing, period or glider class.
- Aggregate stats across all pilots.
- Weather of the flight day and atmospheric soundings.
- Live tracking (inReach, SPOT, SkyLines, FlyMe, Flymaster, OGN, ZOLEO).
- Community and highlights feed.

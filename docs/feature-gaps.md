# Feature gaps vs. reference apps

Compared in October 2026 against skyviz.io (incl. /pricing), ogoy.app, xcfinder.com/en and the flyXC source code on GitHub (`vicb/flyxc`). flyxc.app itself renders client-side only, so the flyXC rows come from its code (`apps/fxc-front`, `apps/fxc-server`, `libs/common`).

**Already covered:** 3D replay, multi-pilot comparison, camera modes incl. smooth follow, flight phases, thermal detection, flight stats, altitude chart, 2D map and split view, free 3D terrain, base map picker, multi-day timeline alignment, plus everything under "Done since the comparison".

## Done since the comparison

| Feature | Delivered | Notes |
|---|---|---|
| Unit preferences (flyXC) | 2026-10-14 | Metric, imperial and aviation presets, or each unit on its own: km/mi/nm, m/ft, m/s, ft/min or kt, km/h, mph or kt. Stored per browser, not in the scene URL. |
| Thermal filter by gain and climb rate (xcfinder) | 2026-10-14 | Min gain and min average climb sliders in display units. Applies to the list, 3D columns, 2D markers, timeline ticks and "next thermal"; saved in the URL (`tgain`, `tclimb`). |
| Transition altitudes and transition phase (xcfinder) | 2026-10-14 | Glides between the filtered thermals (launch, glide, final) with distance, altitude loss, glide ratio and speed; average leave/arrive altitude and lowest arrival in the stats; working band and markers in the altitude chart; "climb / transition" track colour mode in 3D and 2D. |
| Track styling: width, style, colours (skyviz Pro) | 2026-10-14 | Solid, outline, curtain (3D) and glow; width 1–10 px; per-pilot colour picker. Saved in the URL (`style`, `width`, `pc`). Glow needs the pilot colour mode in 3D. |
| View toggles: full screen, pilot labels, 3D height exaggeration, sun lighting, thermal columns, thermal labels (flyXC) | 2026-11-22 | Exaggeration 1–3× scales terrain and tracks together. The sun follows the selected pilot's recorded time. Saved in the URL (`exag`, `sun`, `labels`). Full screen is not saved. Thermal column and label toggles are stored per browser, not in the URL. |
| Height above ground (flyXC) | 2026-11-22 | AGL column in the pilot list. Ground heights come from Terrarium tiles at zoom 13, loaded in the background per flight, so it works in 2D and with any 3D terrain source. Shows a dash while loading or offline. |
| Transition altitudes above ground (AGL) | 2026-11-22 | MSL/AGL switch in the stats Transitions heading, stored per browser. Applies to the stats, the Transitions list and the altitude chart, which then plots height above ground. Uses the loaded ground heights and the pilot altitude offset. Shows a dash in the stats and list, and keeps the chart in MSL with a note, until ground heights are loaded. |
| Thermal colouring by climb strength | 2026-11-22 | 3D columns and labels, 2D markers and list swatches use the vario colour scale on the average climb. |
| Social overlays: track, altitude graph and stats as an image or story (skyviz) | 2026-11-22 | Export menu renders the current 3D frame as a PNG in 16:9, 9:16 or 1:1 with HUD, altitude graph, stats, minimap and map credits, all optional. |
| Video export MP4 (16:9 and 9:16) (skyviz Pro) | 2026-11-22 | Export menu renders the 3D replay frame by frame as an H.264 MP4 in 16:9, 9:16 or 1:1 at 720p, 1080p or 4K, 30 or 60 fps, with the same overlays as the PNG. Set in and out marks, length or speed mode, optional music. Uses the current camera mode, so camera keys apply here too. |
| More formats and converter (skyviz, flyXC) | 2026-11-22 | Import and convert IGC, GPX, KML (`gx:Track`), FIT, TRK and GeoJSON. Export as IGC (unsigned), GPX, KML or GeoJSON on `/convert`. Loading tracks by URL is still open. |
| Local logbook (skyviz) | 2026-11-22 | `/logbook` with totals, monthly and yearly hours, breakdown by year, site and glider, manual entries without IGC, editable fields and notes, plus a whole-app backup file. Stays in the browser, no cloud sync. |
| Camera keys and auto director (skyviz Pro) | 2026-11-22 | "Keys" camera mode in 3D, edited in a Camera row in the bottom timeline. Heading, pitch and range each have their own lane with a stopwatch to animate it, a value field and previous, add and next key buttons. Keys are picked, moved in time or value, copied and pasted, and set to auto, linear, hold or ease interpolation. Undo and redo cover every edit. Summary diamonds show the keys of all lanes when collapsed. "Auto" builds a shot list from the flight phases: a wide establishing shot, chase cams on glides, orbits in thermals and a pull-back. "Capture view" keys the current 3D camera at the playhead. Keys are stored per set of flights in this browser (IndexedDB), not in the scene URL. |
| Dashed track style and smooth track | 2026-11-22 | Dashed is a style with a fixed screen-space pattern that scales with the width, in every colour mode, in 3D and 2D. The Smooth toggle draws the track as a spline through the fixes (3 extra points per segment, gaps over 60 s or 500 m stay straight). Only the drawn line changes, the pilot marker and camera keep the raw fixes. Saved in the URL (`style=dashed`, `smooth=1`). |
| XC scoring of a track (flyXC) | 2026-11-22 | "XC" section in the replay side panel with type, distance, multiplier and points, plus a points list when several pilots are loaded. Four leagues: XContest (default), FFVL, FAI and UK XC League, picked per browser. Other leagues are open. Scored in a Web Worker with `igc-xc-score` (10 s budget, best result so far) and cached per flight and league in IndexedDB. The selected pilot's route is drawn in 2D and 3D, with the closing circle for triangles. The logbook shows type and points per flight and total points, scored in the background for the chosen league. |
| Route planner (flyXC) | 2026-11-22 | `/plan` page: click the map to draw a route, drag points, click a leg midpoint to insert one, undo and clear. Shows total and per-leg distance, XC score per league, and a duration estimate from a speed in km/h. The route and speed live in the URL (`?r=`, `&v=`) for a share link. Task export is open. |
| XC route from a flight (xcfinder) | 2026-11-22 | "Make route" in the XC section: 1 to 30 turnpoints that maximise the summed leg distance, opened in the planner for editing. Turnpoints show as numbered points. |
| Airspaces in 2D and 3D (flyXC) | 2026-11-22 | openAIP vector tiles with a free key per browser, filtered by class, floor and opacity, click for details in 2D. In the replay map and the planner. The 3D replay draws translucent volumes scaled with the altitude exaggeration. Limits: FL is treated as MSL, AGL ceilings are treated as MSL, GND floors start at 0 m, FIR and UIR are skipped. |

## Possible without a backend

| Gap | Seen at |
|---|---|
| XCTSK import, load tracks by URL (may need a CORS proxy) | flyXC, skyviz |
| Task and waypoint export: XCTrack `.xctsk` with QR code and "open in XCTrack" link, SeeYou `.cup`, XCSoar `.tsk`, GPX, KML, FormatGEO | xcfinder, flyXC |
| Airspaces in the altitude profile | flyXC |
| Thermal hotspot overlay (thermal.kk7.ch) by type, month, time of day | flyXC |
| National topo maps: IGN France (incl. OACI chart), IGN Spain | flyXC |
| Chart metric switch altitude / speed / vario, ground elevation fill, wheel zoom | flyXC |
| Place search, "my location", installable PWA | flyXC |
| Languages: German/English, French | skyviz, xcfinder |

## Needs a backend

| Gap | Seen at |
|---|---|
| Accounts and cloud storage | all |
| Logbook sync across devices (the local logbook exists) | skyviz |
| XContest import | skyviz |
| Public shareable scenes, "latest scenes", monthly rankings | ogoy |
| Flight database search: area crossed, takeoff, landing, period, glider class | xcfinder |
| Aggregate stats: monthly distribution, yearly trends, most-flown wings | xcfinder |
| Weather context of the flight day, atmospheric soundings | xcfinder, flyXC |
| Live tracking (inReach, SPOT, SkyLines, FlyMe, Flymaster, OGN, ZOLEO) with history and emergency flag | flyXC |
| Community and highlights feed | skyviz |

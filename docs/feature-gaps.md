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
| Thermal colouring by climb strength | 2026-11-22 | 3D columns and labels, 2D markers and list swatches use the vario colour scale on the average climb. |
| Social overlays: track, altitude graph and stats as an image or story (skyviz) | 2026-11-22 | Export menu renders the current 3D frame as a PNG in 16:9, 9:16 or 1:1 with HUD, altitude graph, stats, minimap and map credits, all optional. |
| Video export MP4 (16:9 and 9:16) (skyviz Pro) | 2026-11-22 | Export menu renders the 3D replay frame by frame as an H.264 MP4 in 16:9, 9:16 or 1:1 at 720p, 1080p or 4K, 30 or 60 fps, with the same overlays as the PNG. Set in and out marks, length or speed mode, optional music. Uses the current camera mode. The cinematic camera is still open. |

## Possible without a backend

| Gap | Seen at |
|---|---|
| Cinematic auto camera and camera keyframes for video export | skyviz (Pro) |
| Dashed track style (Cesium dash material is single-colour, like glow) | follow-up of track styling |
| FIT import (skyviz has a GPX/FIT→IGC converter) | skyviz |
| More formats: GPX, KML, TRK, GeoJSON, XCTSK; load tracks by URL (may need a CORS proxy) | flyXC, skyviz |
| Transition altitudes above ground (AGL); needs terrain sampling at transition ends | follow-up of transitions |
| XC route optimised from a flight (up to 30 turnpoints), editable waypoints, turnpoints shown on the route | xcfinder |
| XC scoring of a track (free distance, flat and FAI triangle) for XContest, CFD, Leonardo, UK XC League, Czech ČPP, Norway, World XC | flyXC (`@flyxc/optimizer`) |
| Route planner: free draw, distance, score, speed and duration estimate, share link | flyXC |
| Task and waypoint export: XCTrack `.xctsk` with QR code and "open in XCTrack" link, SeeYou `.cup`, XCSoar `.tsk`, GPX, KML, FormatGEO | xcfinder, flyXC |
| Airspaces in 2D and 3D (openAIP, free API key): filter by class A–G, type, floor, opacity; airspaces in the altitude profile | flyXC |
| Thermal hotspot overlay (thermal.kk7.ch) by type, month, time of day | flyXC |
| National topo maps: IGN France (incl. OACI chart), IGN Spain | flyXC |
| Chart metric switch altitude / speed / vario, ground elevation fill, wheel zoom | flyXC |
| Place search, "my location", installable PWA | flyXC |
| Languages: German/English, French | skyviz, xcfinder |

## Needs a backend

| Gap | Seen at |
|---|---|
| Accounts and cloud storage | all |
| Logbook incl. manual entries without IGC, long-term stats | skyviz |
| XContest import | skyviz |
| Public shareable scenes, "latest scenes", monthly rankings | ogoy |
| Flight database search: area crossed, takeoff, landing, period, glider class | xcfinder |
| Aggregate stats: monthly distribution, yearly trends, most-flown wings | xcfinder |
| Weather context of the flight day, atmospheric soundings | xcfinder, flyXC |
| Live tracking (inReach, SPOT, SkyLines, FlyMe, Flymaster, OGN, ZOLEO) with history and emergency flag | flyXC |
| Community and highlights feed | skyviz |

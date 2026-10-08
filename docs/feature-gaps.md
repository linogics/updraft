# Feature gaps vs. reference apps

Compared in October 2026 against skyviz.io (incl. /pricing), ogoy.app, xcfinder.com/en and the flyXC source code on GitHub (`vicb/flyxc`). flyxc.app itself renders client-side only, so the flyXC rows come from its code (`apps/fxc-front`, `apps/fxc-server`, `libs/common`).

**Already covered:** 3D replay, multi-pilot comparison, camera modes incl. smooth follow, flight phases, thermal detection, flight stats, altitude chart, 2D map and split view, free 3D terrain, base map picker, multi-day timeline alignment.

## Done since the comparison

| Feature | Delivered | Notes |
|---|---|---|
| Unit preferences (flyXC) | 2026-10-14 | Metric, imperial and aviation presets, or each unit on its own: km/mi/nm, m/ft, m/s, ft/min or kt, km/h, mph or kt. Stored per browser, not in the scene URL. |
| Thermal filter by gain and climb rate (xcfinder) | 2026-10-14 | Min gain and min average climb sliders in display units. Applies to the list, 3D columns, 2D markers, timeline ticks and "next thermal"; saved in the URL (`tgain`, `tclimb`). |

## Possible without a backend

| Gap | Seen at |
|---|---|
| Video export MP4 (16:9 and 9:16) with cinematic auto camera | skyviz (Pro) |
| Social overlays: track, altitude graph and stats as an image or story | skyviz |
| Track styling: width, style, colours | skyviz (Pro) |
| FIT import (skyviz has a GPX/FIT→IGC converter) | skyviz |
| More formats: GPX, KML, TRK, GeoJSON, XCTSK; load tracks by URL (may need a CORS proxy) | flyXC, skyviz |
| Transition altitudes and a transition phase | xcfinder |
| XC route optimised from a flight (up to 30 turnpoints), editable waypoints, turnpoints shown on the route | xcfinder |
| XC scoring of a track (free distance, flat and FAI triangle) for XContest, CFD, Leonardo, UK XC League, Czech ČPP, Norway, World XC | flyXC (`@flyxc/optimizer`) |
| Route planner: free draw, distance, score, speed and duration estimate, share link | flyXC |
| Task and waypoint export: XCTrack `.xctsk` with QR code and "open in XCTrack" link, SeeYou `.cup`, XCSoar `.tsk`, GPX, KML, FormatGEO | xcfinder, flyXC |
| Airspaces in 2D and 3D (openAIP, free API key): filter by class A–G, type, floor, opacity; airspaces in the altitude profile | flyXC |
| Thermal hotspot overlay (thermal.kk7.ch) by type, month, time of day | flyXC |
| National topo maps: IGN France (incl. OACI chart), IGN Spain | flyXC |
| Chart metric switch altitude / speed / vario, ground elevation fill, wheel zoom | flyXC |
| Live readout: altitude, height above ground, vertical and horizontal speed | flyXC |
| 3D height exaggeration slider, sun lighting | flyXC |
| Pilot label toggle, place search, "my location", full screen, installable PWA | flyXC |
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

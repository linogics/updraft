# Help

How to use updraft. A list of all features is in [features.md](features.md).

updraft runs fully in your browser. There is no account. Your flights and settings stay in this browser until you delete them or clear the site data. See [Privacy](#privacy).

## Getting started

1. Open https://updraft.linogics.io. The start page shows the navigation on the left and your logbook on the right.
2. Drop one or more flight files on the drop zone (IGC, GPX, KML, FIT, TRK or GeoJSON). No file at hand? Click "load demo flights".
3. The flights are saved in the logbook. Files from the same day open together in the studio.

The logo in the top left always brings you back to the start page. On a phone the navigation is behind the menu button in the top bar.

## Studio

Open the studio from the navigation ("Studio" opens the last flight) or from the logbook (tick flights, then "Open selected in Studio").

### Layout

- The toolbar switches between **3D**, **2D** and **Split**.
- The left dock (pilots, climbs), the right dock (stats, XC) and the bottom dock (altitude chart, timeline) can be resized by dragging their edge, or collapsed. With the edge focused, the arrow keys, Home and End resize it and Enter collapses it. A dock without panels disappears and the views take its space.

### Panels

- Drag a panel by its grip (in the panel header, or on its tab in the bottom dock) and drop it anywhere in any dock. A marker shows where it will land, and a dock without panels shows a drop strip at its edge while you drag. The dock under the pointer scrolls when you hold the panel near its top or bottom edge. Escape cancels the drag.
- Every panel has an actions menu (the "..." button in its header or tab). Use it to move the panel up, down, left or right inside its dock, to move it to another dock, or to hide it. Moves are announced to screen readers and the focus stays on the menu button.
- The toolbar **Panels** menu has a switch per panel to show or hide it, and **Restore default layout** puts everything back.

### Plugins

- **Panels**, **Add plugin...** adds a panel from the URL of a JavaScript module (http or https). A plugin runs with full access to the page and your flights, so only add plugins you trust. The studio checks the module and shows what is wrong in the dialog if it cannot use it.
- A plugin appears in the Panels menu like any panel, with a **Remove** button. It is only loaded while its panel is shown. If it fails, only its own panel shows an error and the rest of the studio keeps working.
- To work offline, the plugin should be one bundled file served with CORS (the `Access-Control-Allow-Origin` header), because only that file is stored and the browser needs CORS to import it from another site. The stored copy is used only when the network is not reachable.
- To write your own plugin, see [plugins.md](plugins.md).
- The layout is kept in this browser. It is not part of the share link.

### Player

| Action | How |
|---|---|
| Play or pause | Play button or Space |
| Jump 30 s | ← and → |
| Seek | Drag the position slider, or click or drag in the altitude chart |
| Speed | Playback speed menu, 1× to 200× |
| Next thermal | "Next thermal ⏭" jumps to the selected pilot's next climb |

### Pilots

- Click a pilot in the pilot list to select them. Stats, climbs and XC follow the selected pilot.
- The checkbox shows or hides a pilot. Click the colour dot to pick a colour, the reset button restores the default.
- "Add pilot" below the list opens your logbook. Filter by pilot, site or date, tick the flights and press Add. "Import files" in the picker stores new track files and ticks them for you. Flights already in the studio are ticked and locked.
- Dropping track files anywhere on the studio page imports them and adds them as pilots. The URL then holds the new pilots, so a reload keeps them.
- The list shows the current altitude and height above ground. Ground heights are only loaded while the pilot list is shown, the AGL altitude mode is on, or an export with the HUD needs them. AGL shows a dash while ground heights load or when offline.

### Several flights and the timeline

- Each pilot has a clip in the timeline. Drag a clip to shift it in time. It snaps to other clips and the playhead, hold Alt to turn snapping off.
- Ctrl+wheel zooms the timeline, "Fit" shows everything.
- Flight alignment: **Real time** plays every flight at its recorded time, **Same day** moves all flights onto one day and keeps their time of day, **Align takeoffs** starts all flights together.

### Track and view

- **Track** menu: colour by vario, phase, climb / transition or pilot, style (solid, outline, dashed, curtain, glow), width and smoothing.
- **View** menu: pilot names, height exaggeration, sun lighting, thermal columns and labels, thermal overlay (hotspots, skyways, opacity) and airspaces.
- **Map** and **Terrain** pick the base map and the 3D terrain.
- The full screen button hides the browser UI.

The studio URL holds the flights and most view settings. Bookmark it to come back to the same view in this browser.

## Camera

Pick a camera mode in the toolbar (3D only):

- **Follow**: smooth chase cam behind the selected pilot.
- **Cockpit**: view from the pilot.
- **Orbit**: circles the selected pilot.
- **Free**: move the camera with the mouse.
- **Keys**: the camera follows the keys you set in the timeline.

### Camera keys

The Camera row in the timeline has a lane for heading, pitch and range.

- Click the stopwatch of a lane to animate it. Then add keys at the playhead with the diamond button, or type a value.
- Previous and next buttons jump between keys.
- Click a key to select it, drag to move it in time or value. Set its interpolation to auto, linear, hold or ease.
- With the timeline focused: Ctrl+C and Ctrl+V copy and paste, Delete removes selected keys, Ctrl+Z undoes, Ctrl+Shift+Z redoes.
- **Capture view** keys the current 3D camera at the playhead. Move the camera in Free mode first.
- **Auto** builds a full camera path from the flight phases of the selected pilot. The density setting decides how many keys it makes.
- **Clear** deletes all keys.

Keys are saved per set of flights in this browser.

## Climbs and glides

The "Climbs & glides" panel has two tabs:

- **Thermals**: each climb with start time, gain, average climb, duration and top altitude. Click a row to jump there.
- **Transitions**: glides between the thermals with distance, glide ratio, altitudes, speed and duration.

The **Min gain** and **Min climb** sliders hide weak thermals. The filter applies to the list, the map, the timeline and "Next thermal".

The stats switch transition altitudes between MSL and AGL. With AGL the altitude chart plots height above ground.

## XC score

The XC panel scores the selected pilot's flight. Scoring only runs while the panel is shown, so hide it if you do not need XC. A spinner shows while flights are scored. Pick a league (XContest, FFVL, FAI, UK XC League), the choice is kept for the whole app. The scored route is drawn on the maps once the XC panel has scored the flight.

**Open in planner** turns the flight into a route with the chosen number of turnpoints and opens it in the planner.

## XC planner

Open "XC Planner" in the navigation.

- Click the map to add points. Drag a point to move it, click a leg midpoint to insert one.
- Undo and Clear fix mistakes.
- Set a speed in km/h for a duration estimate. The score is shown for the chosen league.
- **Copy link** copies a URL with the route, ready to share.
- The planner map has the same base maps, thermal overlay and airspaces as the studio.
- On a phone the controls are in a drawer. Tap the menu button or swipe it open.

## Logbook

The logbook is the start page.

- Totals, hours per year and a breakdown by year, site or glider.
- The table lists every flight. Edit pilot, site, glider and notes with the edit button, or delete a flight.
- "Add flight without a track" logs a flight you have no file for.
- Tick flights and click "Open selected in Studio" to open them together.
- XC type and points are scored in the background for the chosen league.

## Convert

Open "Convert" in the navigation. Drop files, pick an output format (IGC, GPX, KML or GeoJSON) and download one file or all of them. IGC files written here are not signed, so competitions and XContest will not accept them.

## Export images and videos

Export works in 3D and Split layout. Open the **Export** menu in the studio toolbar.

- **Download PNG** saves the current 3D frame. Pick the aspect (16:9, 9:16, 1:1), the size and the overlays.
- **Export video…** renders an MP4.
  1. Set in and out marks at the playhead, or leave them to export the whole flight.
  2. Pick the aspect, resolution, frame rate and quality.
  3. Choose a target length or a speed factor.
  4. Optionally add music. The video can fit the music length, or the music is trimmed to the video.
  5. Click "Render MP4". Keep the tab open until it finishes.
- The current camera mode is used, so camera keys work in videos.
- Video export needs Chrome, Edge or Safari 17+.
- Map providers require attribution when you publish an image or video. Keep the map credits overlay on.

## Backup

The Backup section is at the bottom of the logbook.

- **Export backup** saves flights, manual entries, camera keys and settings to one JSON file. Tick "Include API keys" to also save your Cesium ion and openAIP keys. Do not share such a file.
- **Import backup** reads a file. Choose **Merge with this browser** to add to what is there, or **Replace everything** to start fresh. Reload the page to apply restored settings.

Make a backup now and then. Clearing the browser data deletes all flights.

## Settings

### Units and language

The **Units** menu picks a preset (metric, imperial, aviation) or each unit on its own. The language selector is next to it. Both are kept per browser.

### Terrain and the Cesium ion token

| Terrain | Needs | Notes |
|---|---|---|
| AWS Terrain Tiles | nothing | Default without a token. Free global elevation up to zoom 15 |
| Cesium World Terrain | a free [Cesium ion](https://ion.cesium.com) token | Higher resolution. Default once a token is set. Falls back to AWS Terrain Tiles if ion fails |
| Flat | nothing | No relief |

To add a token, open the **Ion** menu in the studio toolbar, paste the token and click "Save and reload". Leave the field empty to remove it. The token is kept only in this browser.

### Airspaces and the openAIP key

Airspaces need a free key from [openaip.net](https://www.openaip.net). Enter it under Airspaces in the View menu or in the planner. Then pick the classes, hide airspaces with high floors and set the opacity. Airspaces start hidden in every new session, the other settings are kept.

Airspace limits are approximate. Flight levels and AGL ceilings are treated as MSL, GND floors start at 0 m, FIR and UIR are not shown. Always check the official charts.

## Install and offline use

- Install updraft from the browser's address bar or menu ("Install app" or "Add to home screen").
- Once loaded, the logbook, converter and stored flights work offline. Maps, terrain and the 3D view need the network.
- When a new version is out, a banner offers to reload.
- On Chromium the installed app can open track files from the desktop.

## Privacy

- updraft runs fully in your browser on your device. There is no server that stores your data.
- Flight files are read and analysed on your device. They are never uploaded.
- Flights, settings and API keys are kept in this browser only (IndexedDB and local storage).
- There is no account, no tracking and no analytics.
- Backups and exports are files you save yourself.

The map needs tiles from public servers. These servers see your IP address and the map area you look at, never your flight track:

- Satellite imagery: Esri (ArcGIS Online)
- Street map: OpenStreetMap
- Terrain heights: AWS open data (Terrarium tiles)
- Airspaces: OpenAIP
- Thermal hotspots: thermal.kk7.ch
- 3D terrain and imagery: Cesium ion, only if you add an ion token

## Troubleshooting

- **Flights are gone**: the browser data was cleared, or you use another browser, profile or private window. Restore a backup.
- **The 3D view does not load**: the browser needs WebGL. Try another browser or update the graphics driver. 2D still works.
- **The track floats or sinks into the ground**: some loggers record a different height reference. updraft shifts each track by at most ±150 m so takeoff sits on the ground.
- **The API key is not saved**: the browser blocks site storage. Allow storage for the site.
- **A studio link shows no flights**: studio links only work in the browser that holds the flights.

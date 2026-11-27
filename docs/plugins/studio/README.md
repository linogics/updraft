# Studio plugins

A `studio` plugin adds a panel to a dock of the studio. With `hosts` it can also show in the XC planner. The panel gets the flights, the playback time, the selection, the units and the Cesium viewer through services, can draw an overlay over the views and can paint into image and video exports.

- Where it runs: in the studio page (`/studio`) and, with `'plan'` in `hosts`, in the XC planner (`/plan`).
- How to load it: **Panels**, **Add plugin...** in the studio or in the planner. The module is imported when the panel is shown, so a hidden plugin costs nothing.
- Reference: [API reference](api.md), the services it uses are in the [service reference](../service/reference/README.md).

## Fields

`apiVersion` is `2`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type                                                      | Rule                                                                                                                            |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'studio'`                                                | Required.                                                                                                                       |
| `apiVersion` | `2`                                                       | Required. See [Versioning](../README.md#versioning).                                                                            |
| `dock`       | `'left' \| 'right' \| 'bottom'`                           | Required. The dock the panel starts in. The user can move it afterwards.                                                        |
| `mount`      | `(el: HTMLElement, ctx: PluginContext) => void \| fn`     | Required. Called when the panel is shown. Draw into `el`. May return a destroy function.                                        |
| `drawExport` | `(ctx2d: CanvasRenderingContext2D, time: number) => void` | Optional. Paints onto image and video exports. See [Exports](#exports).                                                         |
| `hosts`      | `('studio' \| 'plan')[]`                                  | Optional, defaults to `['studio']`. A non-empty list without duplicates. `'plan'` also shows the panel in the XC planner.       |
| `requires`   | `string[]`                                                | Optional. The services the panel uses, for example `updraft/studio@1`.                                                          |
| `provides`   | `Record<string, ServiceFactory>`                          | Optional. Services the panel offers, registered when the panel is loaded. See [service](../service/README.md).                  |

The `id` is unique among plugins and built-in panels. It identifies the panel in the saved layout. The vendor `updraft` is reserved for bundled plugins.

Validation messages, shown in the dialog when the plugin is added:

- `Unsupported apiVersion X, this studio supports 2.`
- `"dock" must be "left", "right" or "bottom".`
- `"hosts" must be a non-empty list of "studio" or "plan", each at most once.`
- `"mount" must be a function.`
- `"drawExport" must be a function when present.`

## mount

`mount(el, ctx)`:

- `el` is an empty `div` that fills the panel body. Build your UI inside it.
- `ctx` is described below. It is frozen, so you cannot add members to it.
- The function you return is called once when the panel is hidden or the plugin is removed. Stop timers, listeners and anything else you started. Event subscriptions, needs and the overlay are cleaned up by the studio anyway.
- Write to `el` with `textContent` or DOM calls, not `innerHTML`, when the text comes from flight files.

## ctx reference

| Member       | Type                               | Behavior                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use(name)`  | `<T>(string) => T`                 | The service `name`. Only names in your `requires` work, any other name throws `Service "x" is not in requires.`. A missing provider throws too, but the panel is not mounted at all in that case, the user sees which services are missing.          |
| `overlay`    | `HTMLDivElement`                   | A `div` over the 3D and 2D views, owned by the plugin. It has `position: absolute`, fills the views and has `pointer-events: none`, so clicks pass through. Set `pointer-events: auto` on your own children that need clicks. The studio removes it on unmount. |
| `need(kind)` | `('xc' \| 'ground') => () => void` | Asks the studio to run background work for as long as the plugin is mounted: `'xc'` scores the flights, `'ground'` loads ground heights. Returns a release function. Every need is released on unmount. Any other `kind` throws.                      |

Data comes from services, never from `ctx` itself. The studio offers `updraft/studio@1` and `updraft/flight-analysis@1`, see the [service reference](../service/reference/README.md).

## Lifecycle

- A studio plugin is known by its URL, id, name and dock only. The module is not imported until its panel is shown. Installed service plugins are imported first, because the panel may require one of their services.
- Showing the panel (also after a reload, if it was shown before) imports the module and calls `mount`. Hiding the panel from the Panels menu, or removing the plugin, calls your destroy function and removes the overlay, the subscriptions and the needs.
- Showing the panel again calls `mount` again with a fresh `el` and `ctx`. The module itself is not evaluated again, so module level variables survive. Keep per-mount state inside `mount`.
- The module is imported once per page load. After you change the file, reload the studio to pick up the new version.

## Errors

| Failure                                   | What the user sees                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| A required service has no provider        | An error box in the plugin's panel naming the missing services. The plugin is not mounted. |
| Error in `mount`                          | An error box in the plugin's own panel: "Plugin NAME failed: MESSAGE".                    |
| Error in an `on` handler                  | The same error box. Other handlers keep running.                                          |
| Error in the destroy function             | Nothing visible. It is written to the browser console and cleanup continues.              |
| Error in `drawExport`                     | A message that the plugin failed while drawing and was left out of that export.           |

Also see [Errors](../README.md#errors) for the errors while adding.

## Exports

If the plugin has `drawExport`, it is listed with its own checkbox in the image and video export dialogs, and can be switched off there.

- Signature: `drawExport(ctx2d, time)`. `ctx2d` is the 2D context of the export frame, `time` is the studio playback time of that frame in ms.
- It must be synchronous. A returned promise is ignored.
- The frame size is `ctx2d.canvas.width` by `ctx2d.canvas.height`. It depends on the export settings, so do not hard-code pixels.
- Plugins are painted on top of the studio frame, in layout order: left dock, then right dock, then bottom dock, each from top to bottom.
- Only plugins whose panel is shown take part.
- The canvas state is saved before and restored after each plugin, so you can change fonts, styles and transforms freely.
- `drawExport` has no `ctx`. If you need flight data, keep the studio service from `mount` in a module variable and clear it in your destroy function, as the example does.
- A plugin that throws is left out of the rest of that export and the export continues.

## The XC planner host

A plugin with `'plan'` in `hosts` shows up in the XC planner (`/plan`) after the bundled panels, in one column. The user can drag, fold and remove it there. The planner has its own Panels menu in the sidebar header, with the same switches, Uninstall and Add plugin as the studio. The layout is kept per browser, separate from the studio.

`ctx` has the same shape, with these differences:

- Events come from the planner service `updraft/plan@1`, see [its reference](../service/reference/updraft-plan-1.md).
- `overlay` covers the map.
- `need(kind)` throws `need is not available in the planner.`.
- The studio services (`updraft/studio@1`, `updraft/flight-analysis@1`) are not provided. A plugin that lists both hosts must not require them, or must check the host first.

A route suggestion is not an export. Use a studio plugin with `hosts: ['plan']` that calls `setRoute` of `updraft/plan@1`. Export buttons and leagues are the [xc-planner kind](../xc-planner/README.md).

## Examples

The app serves two examples itself, so you can add `https://<host>/plugins/<file>` to try them.

- [static/plugins/example.js](../../../static/plugins/example.js), served at `/plugins/example.js`. It requires `updraft/studio@1` and shows the altitude and the climb of the selected pilot. It updates on the `time`, `selection` and `units` events, writes a label into the overlay and draws the pilot name and altitude into exports with `drawExport`. The studio service from `mount` is kept in a module variable for `drawExport` and cleared in the destroy function.
- [static/plugins/compass.js](../../../static/plugins/compass.js), served at `/plugins/compass.js`. It reads the Cesium viewer with `viewer()` and shows the camera heading as a rose in the overlay that turns with the 3D camera. A 3x3 picker sets where the rose sits, and the same rose is painted into exports.

The smallest panel is the `hello.js` of the [quick start](../README.md#quick-start).

## Bundled plugins

Contributors add a panel that ships with the app as a plugin:

1. Create the folder `src/lib/plugins/builtin/<name>/` with the panel component and an `index.ts` whose default export is the plugin.
2. For a component that takes `{ studio }`, use `componentPlugin({ id, name, dock, requires?, hosts?, drawExport?, state? }, Component)` from `src/lib/plugins/builtin/componentPlugin.ts`. It mounts the component and reads the studio from `updraft/studio-state@1`, which only plugins with an `updraft/` id may use. Pass `state: null` for a component without props, so it needs no state and mounts in every host. Planner components use `state: { service: 'updraft/plan-state@1', prop: 'plan' }`.
3. Add an entry to `BUILTIN_PLUGINS` in `src/lib/plugins/builtin.ts` with the title, dock, default flags and `load: () => import('./builtin/<name>')`. The array order is the default order inside each dock. Add `hosts: ['studio', 'plan']` to show it in the planner too, or `['plan']` for a planner only panel. The panel id is `plugin:<id>`. Bundled planner panels cannot be removed.

Bundled plugins may import app code directly. `src/lib/plugins/builtin/units/` is the template, `stats/` shows the service only variant. The built-in Stats panel is itself a plugin (`updraft/stats`) built only on `updraft/studio@1` and `updraft/flight-analysis@1`. Bundled plugins cannot be removed, but can be hidden and moved like any panel.

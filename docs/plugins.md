# Plugins

How to write a studio plugin. For using plugins as a user see [help.md](help.md#plugins), for the feature list see [features.md](features.md).

## What a plugin is

A plugin is one ES module in plain JavaScript. Its default export describes a panel for the studio. There is no build step and no package to install. You can write the file by hand, or bundle your own code into one file with any tool you like.

The module is imported with `import()` into the studio page, so it runs inside the page with full trust. It can read everything the page can, including all your flights. See [Security](#security).

## Quick start

Save this as `hello.js`:

```js
export default {
  id: 'hello',
  name: 'Hello',
  kind: 'studio',
  apiVersion: 1,
  dock: 'right',
  mount(el, ctx) {
    const draw = () => {
      el.textContent = `Time ${ctx.time()} ms, ${ctx.flights().length} flights`;
    };

    const stop = ctx.subscribe(draw);
    draw();
    return stop;
  }
};
```

Serve it from any static host that sends CORS headers. Locally:

```sh
npx serve --cors
```

This serves the current folder at `http://localhost:3000`. GitHub Pages works too, it sends `Access-Control-Allow-Origin: *`.

Then open the studio, choose **Panels**, **Add plugin...**, paste `http://localhost:3000/hello.js` and press **Add**. The panel appears in the dock you named.

A larger, commented example is in [static/plugins/example.js](../static/plugins/example.js). The app serves it itself at `/plugins/example.js`, so you can add `https://<host>/plugins/example.js` to try it. It shows the altitude and the climb of the selected pilot, a label in the overlay, and draws the pilot name and altitude into exports.

## Module contract

The default export is an object with these fields. The studio checks them when you add the plugin and shows the message of the first problem in the dialog.

| Field          | Type                                                  | Rule                                                                                                                                   |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`                                              | Matches `/^[a-z0-9-]{1,40}$/`. Unique among plugins and built-in panels. Stable, it identifies the panel in the saved layout.          |
| `name`         | `string`                                              | Not blank. Shown as the panel title, in the Panels menu and in the export dialogs.                                                     |
| `kind`         | `'studio'`                                            | What the plugin extends. Must be `'studio'`, the only kind so far. Each kind has its own fields and its own `apiVersion`.              |
| `apiVersion`   | `1`                                                   | Must be the number `1` for the studio kind. See [Versioning](#versioning).                                                                                 |
| `dock`         | `'left' \| 'right' \| 'bottom'`                       | The dock the panel starts in. The user can move it afterwards.                                                                         |
| `mount`        | `(el: HTMLElement, ctx: PluginContext) => void \| fn` | Called when the panel is shown. Draw into `el`. May return a destroy function.                                                         |
| `drawExport`   | `(ctx2d: CanvasRenderingContext2D, time: number) => void` | Optional. Paints onto image and video exports. See [Exports](#exports).                                                            |

`mount(el, ctx)`:

- `el` is an empty `div` that fills the panel body. Build your UI inside it.
- `ctx` is described in the next section. It is frozen, so you cannot add members to it.
- The function you return is called once when the panel is hidden or the plugin is removed. Stop timers, listeners and anything else you started. Subscriptions, needs and the overlay are cleaned up by the studio anyway.
- Write to `el` with `textContent` or DOM calls, not `innerHTML`, when the text comes from flight files.

## ctx reference

Every value is read through a function, so it is always current. Call the function again instead of keeping its result.

| Member                | Type                          | Behavior                                                                                                                                                                                        |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flights()`           | `PluginFlight[]`              | All pilots in the studio, in list order. A new array of new objects on every call.                                                                                                              |
| `time()`              | `number`                      | Playback time in ms on the studio clock.                                                                                                                                                        |
| `selectedId()`        | `string \| null`              | Id of the selected pilot, or null.                                                                                                                                                              |
| `units()`             | `Units`                       | The display units the user chose, a copy. See below.                                                                                                                                            |
| `seek(ms)`            | `(number) => void`            | Moves playback to `ms` on the studio clock. The studio clamps it to the playable range.                                                                                                         |
| `select(id)`          | `(string) => void`            | Selects the pilot with that flight id. An unknown id is ignored.                                                                                                                                |
| `viewer()`            | `Viewer \| null`              | The Cesium viewer. Null while there is no 3D view, for example in the 2D map, so check it every time.                                                                                           |
| `overlay`             | `HTMLDivElement`              | A `div` over the 3D and 2D views, owned by the plugin. It has `position: absolute`, fills the views and has `pointer-events: none`, so clicks pass through. Set `pointer-events: auto` on your own children that need clicks. The studio removes it on unmount. |
| `subscribe(fn)`       | `(() => void) => () => void`  | Calls `fn` after time, flights, selection or units changed, at most once per animation frame. It does not fire for the state at the time you subscribe, so call your draw once yourself. Returns a function that stops it. |
| `need(kind)`          | `('xc' \| 'ground') => () => void` | Asks the studio to run background work for as long as the plugin is mounted: `'xc'` scores the flights, `'ground'` loads ground heights. Returns a release function. Every need is released on unmount. Any other `kind` throws. |

`PluginFlight`:

| Field     | Type             | Meaning                                                                                                                         |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`         | Flight id, the value for `selectedId()` and `select()`.                                                                         |
| `pilot`   | `string`         | Pilot name.                                                                                                                     |
| `glider`  | `string \| null` | Glider, if the file has one.                                                                                                    |
| `color`   | `string`         | The pilot colour as a CSS colour.                                                                                               |
| `visible` | `boolean`        | Whether the pilot is shown.                                                                                                     |
| `fixes`   | `{ t, lat, lon, alt }[]` | Track points sorted by time. `t` is in ms on the studio clock, so time shifts of the pilot are already applied. `lat` and `lon` are degrees, `alt` is metres. The array is shared with the studio, do not modify it or its objects. |

`Units` has the four display units. Values you get from the studio are always SI, convert them for display:

| Field      | Values                    |
| ---------- | ------------------------- |
| `distance` | `'km'`, `'mi'`, `'nm'`    |
| `alt`      | `'m'`, `'ft'`             |
| `vario`    | `'ms'`, `'fpm'`, `'kt'`   |
| `speed`    | `'kmh'`, `'mph'`, `'kt'`  |

## Lifecycle

- A plugin is known by its URL, id, name and dock only. The module is not imported until its panel is shown, so a hidden plugin costs nothing.
- Showing the panel (also after a reload, if it was shown before) imports the module and calls `mount`. Hiding the panel from the Panels menu, or removing the plugin, calls your destroy function and removes the overlay, the subscriptions and the needs.
- Showing the panel again calls `mount` again with a fresh `el` and `ctx`. The module itself is not evaluated again, so module level variables survive. Keep per-mount state inside `mount`.
- The module is imported once per page load. After you change the file, reload the studio to pick up the new version.

## Exports

If the plugin has `drawExport`, it is listed with its own checkbox in the image and video export dialogs, and can be switched off there.

- Signature: `drawExport(ctx2d, time)`. `ctx2d` is the 2D context of the export frame, `time` is the studio playback time of that frame in ms.
- It must be synchronous. A returned promise is ignored.
- The frame size is `ctx2d.canvas.width` by `ctx2d.canvas.height`. It depends on the export settings, so do not hard-code pixels.
- Plugins are painted on top of the studio frame, in layout order: left dock, then right dock, then bottom dock, each from top to bottom.
- Only plugins whose panel is shown take part.
- The canvas state is saved before and restored after each plugin, so you can change fonts, styles and transforms freely.
- `drawExport` has no `ctx`. If you need flight data, keep the `ctx` from `mount` in a module variable and clear it in your destroy function, as the example does.
- A plugin that throws is left out of the rest of that export and the export continues. The user sees a message that the plugin failed while drawing.

## Errors

The studio never lets a plugin break other panels.

| Failure                                    | What the user sees                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Bad URL when adding                        | In the dialog: "The address must be a valid http or https URL."                                                        |
| Same URL added twice                       | In the dialog: "This plugin is already added."                                                                         |
| Import error (network, CORS, syntax error) | In the dialog: "Could not load the plugin." followed by the browser message. Nothing is added.                         |
| Contract error (missing or bad field)      | In the dialog, the message of the first problem, for example `"dock" must be "left", "right" or "bottom".`. Nothing is added. |
| Id already used                            | In the dialog: `The id "..." is already in use.`                                                                       |
| Error in `mount`                           | An error box in the plugin's own panel: "Plugin NAME failed: MESSAGE".                                                 |
| Error in a `subscribe` callback            | The same error box. Other subscribers keep running.                                                                    |
| Error in the destroy function              | Nothing visible. It is written to the browser console and cleanup continues.                                          |
| Error in `drawExport`                      | A message that the plugin failed while drawing and was left out of that export.                                       |

Everything is also logged to the browser console with the plugin id.

A plugin that was added earlier but fails to load later, for example because the host is gone or the `id` in the file changed, fails in its own panel only, the rest of the studio keeps working.

## Offline and hosting

- Serve the plugin as one bundled file. Only that file is stored for offline use, so a plugin that imports other files from the network will not work offline.
- The host must send CORS headers (`Access-Control-Allow-Origin`), because the studio imports the file from another origin. Same-origin files need no header.
- The studio stores a copy of the file in the browser when you add the plugin. The service worker loads plugins network first, so an update on your host is used as soon as it is reachable, and the stored copy is used only when the network is not. The copy is refreshed on every successful load and deleted when the plugin is removed.
- The copy is made on a best effort basis. If it fails, the plugin still works online and a warning goes to the console.
- Files in the app's own `static/plugins/` folder are part of the app and are available offline with it.

## Versioning

Every kind of plugin has its own `apiVersion`. For the studio kind it is `1`. The studio supports exactly this value. A plugin with any other value, or none, is refused with "Unsupported apiVersion X, this studio supports 1." It is not mounted. Keep `apiVersion` at `1` until this document says a newer one exists.

## Security

A plugin is code from the internet that runs in the studio page. There is no sandbox. It has the same access as the app itself, including every flight stored in this browser, the network and the page content. The studio cannot see what a plugin does.

- Add only plugins from authors you trust, ideally with source you or someone you trust has read.
- A URL that points to a mutable file can change at any time. The studio loads the current version on every load. Copy the file to a host you control if you want it to stay as reviewed.
- Subresource Integrity cannot protect a URL the user types in, so the studio does not check a hash.
- Plugin authors should not send flight data anywhere without telling the user.

The dialog shows a warning before you add a plugin. Removing a plugin removes its entry, its layout slot and its stored copy.

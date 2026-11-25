# Plugins

How to write a studio plugin. For using plugins as a user see [help.md](help.md#plugins), for the feature list see [features.md](features.md).

## What a plugin is

A plugin is one ES module in plain JavaScript. Its default export describes a panel for the studio. There is no build step and no package to install. You can write the file by hand, or bundle your own code into one file with any tool you like.

The module is imported with `import()` into the studio page, so it runs inside the page with full trust. It can read everything the page can, including all your flights. See [Security](#security).

## Quick start

Save this as `hello.js`:

```js
export default {
  id: 'me/hello',
  name: 'Hello',
  kind: 'studio',
  apiVersion: 2,
  dock: 'right',
  requires: ['updraft/studio@1'],
  mount(el, ctx) {
    const studio = ctx.use('updraft/studio@1');
    const draw = () => {
      el.textContent = `Time ${studio.time()} ms, ${studio.flights().length} flights`;
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

The default export is an object. The studio checks it when you add the plugin and shows the message of the first problem in the dialog.

Fields of every kind:

| Field      | Type                                      | Rule                                                                                                                              |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `string`                                  | `vendor/name`, each part matches `[a-z0-9-]{1,40}`, for example `acme/wind-panel`. Unique among plugins and built-in panels. Stable, it identifies the panel in the saved layout. The vendor `updraft` is reserved for bundled plugins, added plugins cannot use it. |
| `name`     | `string`                                  | Not blank. Shown as the panel title, in the Panels menu and in the export dialogs.                                                |
| `kind`     | `'studio' \| 'service' \| 'backend'`                 | What the plugin extends. Each kind has its own fields and its own `apiVersion`.                                                   |
| `provides` | `Record<string, (ctx) => object>`         | Optional. Services this plugin offers, see [Services](#services).                                                                 |
| `requires` | `string[]`                                | Optional. Services this plugin uses. `ctx.use` only hands out these.                                                              |

Kind `studio`, `apiVersion: 2`, a panel in a dock:

| Field        | Type                                                      | Rule                                                                                 |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apiVersion` | `2`                                                       | See [Versioning](#versioning).                                                       |
| `dock`       | `'left' \| 'right' \| 'bottom'`                           | The dock the panel starts in. The user can move it afterwards.                       |
| `mount`      | `(el: HTMLElement, ctx: PluginContext) => void \| fn`     | Called when the panel is shown. Draw into `el`. May return a destroy function.       |
| `drawExport` | `(ctx2d: CanvasRenderingContext2D, time: number) => void` | Optional. Paints onto image and video exports. See [Exports](#exports).              |

Kind `service`, `apiVersion: 1`, headless: no panel, `provides` must not be empty.

Kind `backend`, `apiVersion: 1`, headless: a sync server. It needs `create(config: { url: string }): BackendAdapter`. See [Backends](#backends).

`mount(el, ctx)`:

- `el` is an empty `div` that fills the panel body. Build your UI inside it.
- `ctx` is described in the next section. It is frozen, so you cannot add members to it.
- The function you return is called once when the panel is hidden or the plugin is removed. Stop timers, listeners and anything else you started. Subscriptions, needs and the overlay are cleaned up by the studio anyway.
- Write to `el` with `textContent` or DOM calls, not `innerHTML`, when the text comes from flight files.

## ctx reference

| Member          | Type                               | Behavior                                                                                                                                                                                        |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use(name)`     | `<T>(string) => T`                 | The service `name`. Only names in your `requires` work, any other name throws `Service "x" is not in requires.`. A missing provider throws too, but the panel is not mounted at all in that case, the user sees which services are missing. |
| `overlay`       | `HTMLDivElement`                   | A `div` over the 3D and 2D views, owned by the plugin. It has `position: absolute`, fills the views and has `pointer-events: none`, so clicks pass through. Set `pointer-events: auto` on your own children that need clicks. The studio removes it on unmount. |
| `subscribe(fn)` | `(() => void) => () => void`       | Calls `fn` after time, flights, selection or units changed, at most once per animation frame. It does not fire for the state at the time you subscribe, so call your draw once yourself. Returns a function that stops it. |
| `need(kind)`    | `('xc' \| 'ground') => () => void` | Asks the studio to run background work for as long as the plugin is mounted: `'xc'` scores the flights, `'ground'` loads ground heights. Returns a release function. Every need is released on unmount. Any other `kind` throws. |

## Services

A service is a named, versioned object. Plugins depend on services, never on other plugins, so any plugin that provides a service can stand in for another.

- Name: `vendor/service@major`, for example `updraft/studio@1`. The major version changes only when the contract breaks.
- `provides` maps a name to a factory `(ctx) => object`. `ctx.use(name)` inside a factory gets another service. A cycle throws a clear error.
- A factory runs on the first `use`, the result is cached and every caller gets the same object.
- The first provider of a name wins, a second one is refused. Added plugins cannot provide `updraft/` names.
- A studio plugin registers its services when its panel is loaded, a service plugin is imported when the app starts. Removing the plugin removes its services.

A headless service plugin:

```js
export default {
  id: 'me/wind',
  name: 'Wind data',
  kind: 'service',
  apiVersion: 1,
  provides: {
    'me/wind@1': () => ({ at: (lat, lon, alt) => ({ speed: 4, from: 270 }) })
  }
};
```

Another plugin lists `'me/wind@1'` in `requires` and calls `ctx.use('me/wind@1').at(...)`.

Performance: a service call is a plain function call in the page. Services are built on first use and return shared data without copying, so treat everything a service returns as read only and never modify it.

### updraft/studio@1

Provided by the studio while it is open. Every value is read through a function, so it is always current. Call the function again instead of keeping its result. `flights()` and `units()` return the same frozen value until something changes, so it is cheap to call in every frame.

| Member         | Type                 | Behavior                                                                                                    |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `flights()`    | `readonly PluginFlight[]` | All pilots in the studio, in list order. The same frozen array until flights, colors or visibility change. |
| `time()`       | `number`             | Playback time in ms on the studio clock.                                                                    |
| `selectedId()` | `string \| null`     | Id of the selected pilot, or null.                                                                          |
| `units()`      | `Readonly<Units>`    | The display units the user chose. The same frozen object until the user changes them. See below.            |
| `altRef()`     | `'msl' \| 'agl'`     | The altitude reference the user chose for transition altitudes.                                             |
| `seek(ms)`     | `(number) => void`   | Moves playback to `ms` on the studio clock. The studio clamps it to the playable range.                    |
| `select(id)`   | `(string) => void`   | Selects the pilot with that flight id. An unknown id is ignored.                                            |
| `viewer()`     | `Viewer \| null`     | The Cesium viewer. Null while there is no 3D view, for example in the 2D map, so check it every time.      |

### updraft/flight-analysis@1

Provided by the studio while it is open. Lookups are by flight id (see `PluginFlight.id`) and return null for an unknown id. Results are the studio's own objects, read only.

| Member                  | Type                                       | Behavior                                                                                                                                     |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `stats(id)`             | `FlightStats \| null`                      | Duration, distances, altitudes, max climb and sink, glide ratio and phase shares of the flight.                                              |
| `transitions(id, ref)`  | `TransitionSummary \| null`                | Summary of the glides between climbs, with altitudes in `'msl'` or `'agl'`. AGL values need ground heights, so hold `ctx.need('ground')` first. |

The types are in `src/lib/studio/analysisService.svelte.ts`. Like every service it is read through functions, so call it again instead of keeping results.

The built-in Stats panel is itself a plugin (`updraft/stats`) built only on `updraft/studio@1` and `updraft/flight-analysis@1`. See `src/lib/plugins/builtin/stats.ts` as a reference example. Bundled plugins cannot be removed, but can be hidden and moved like any panel.

The TypeScript types `StudioService` and `PluginFlight` are in `src/lib/studio/studioService.svelte.ts`, JavaScript plugins can import them in JSDoc as the example does.

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

- A studio plugin is known by its URL, id, name and dock only. The module is not imported until its panel is shown, so a hidden plugin costs nothing. A service plugin has no panel, so it is imported when the app starts.
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
- `drawExport` has no `ctx`. If you need flight data, keep the studio service from `mount` in a module variable and clear it in your destroy function, as the example does.
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
| Reserved `updraft/` id or service          | In the dialog: `The id "..." is reserved, "updraft/" is for bundled plugins.`                                          |
| A required service has no provider         | An error box in the plugin's panel naming the missing services. The plugin is not mounted.                            |
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

## Backends

A backend plugin connects the sync engine to a server. `create({ url })` returns a `BackendAdapter`, which is a `SyncTransport` (`push(changes)` and `pull(cursor)`, see Sync in `docs/development.md`) plus login. The types are in `src/lib/sync/types.ts`.

```ts
export default {
  id: 'acme/mybackend',
  name: 'My backend',
  kind: 'backend',
  apiVersion: 1,
  create: ({ url }) => ({
    authMethods: async () => [{ kind: 'password' }],
    signIn: async (method, input) => ({ user: 'pilot@example.com' }),
    signOut: async () => {},
    session: () => null,
    push: async (changes) => {},
    pull: async (cursor) => ({ changes: [], cursor, more: false })
  })
};
```

- `authMethods()` lists what the server offers. `{ kind: 'password' }` makes the app show an identity and password form and pass `{ identity, password }` as `input`. `{ kind: 'redirect', id, label }` is OAuth or SSO, the adapter runs the popup or redirect itself, so `signIn` is called from a click. `{ kind: 'code', label }` is reserved for one time codes and not used yet.
- The adapter owns the token. It keeps it in its own storage, so `session()` still answers after a reload, and the app never sees it. Use a storage key that includes `url`.
- `push` must apply last write wins per record: a change only replaces the stored one when its `updatedAt` is higher. `pull` returns changes in a stable order after an opaque `cursor`, and `more: true` while there are further pages.
- A deleted record is a change with `deleted: true` and no `data`.
- The app sends validated records. It treats everything from `pull` as untrusted and validates it again, so the adapter does not have to, but it must not run or render it.

## Versioning

Every kind of plugin has its own `apiVersion`. The studio kind is at `2`, the service and backend kinds at `1`. The app supports exactly these values. A plugin with any other value, or none, is refused with "Unsupported apiVersion X, this studio supports 2." It is not mounted. Version 2 of the studio kind replaced the data members of `ctx` (`flights`, `time`, `selectedId`, `units`, `seek`, `select`, `viewer`) with `ctx.use('updraft/studio@1')`. Version 1 plugins are not supported.

## Security

A plugin is code from the internet that runs in the studio page. There is no sandbox. It has the same access as the app itself, including every flight stored in this browser, the network and the page content. The studio cannot see what a plugin does.

- Add only plugins from authors you trust, ideally with source you or someone you trust has read.
- A URL that points to a mutable file can change at any time. The studio loads the current version on every load. Copy the file to a host you control if you want it to stay as reviewed.
- Subresource Integrity cannot protect a URL the user types in, so the studio does not check a hash.
- Plugin authors should not send flight data anywhere without telling the user.

The dialog shows a warning before you add a plugin. Removing a plugin removes its entry, its layout slot and its stored copy.

# Plugins

How to write a plugin. For using plugins as a user see [help.md](../help.md#plugins), for the feature list see [features.md](../features.md).

## What a plugin is

A plugin is one ES module in plain JavaScript. Its default export describes what the plugin adds to the app. There is no build step and no package to install. You can write the file by hand, or bundle your own code into one file with any tool you like.

The module is imported with `import()` into the app page, so it runs inside the page with full trust. It can read everything the page can, including all your flights. See [Security](#security).

## Kinds

The `kind` field says what a plugin extends. Each kind has its own guide, its own generated API reference, runnable examples and its own `apiVersion`.

| Kind         | Adds                                            | Guide                                | API reference                           |
| ------------ | ----------------------------------------------- | ------------------------------------ | --------------------------------------- |
| `studio`     | A panel in a dock of the studio or the planner. | [studio](studio/README.md)           | [api](studio/api.md)                    |
| `service`    | A headless service other plugins can use.       | [service](service/README.md)         | [api](service/api.md)                   |
| `converter`  | A track file format the app can read or write.  | [converter](converter/README.md)     | [api](converter/api.md)                 |
| `xc-planner` | Export buttons and scoring leagues.             | [xc-planner](xc-planner/README.md)   | [api](xc-planner/api.md)                |
| `badge`      | Tiered achievements for the logbook.            | [badge](badge/README.md)             | [api](badge/api.md)                     |
| `backend`    | A sync server the app can connect to.           | [backend](backend/README.md)         | [api](backend/api.md)                   |

Your own sync server does not need a backend plugin if it follows the [sync server spec](backend/server/README.md).

The full typed contract is `/updraft-plugin.d.ts` on the deployed app (source `src/lib/plugins/api.d.ts`). JavaScript plugins can use it in JSDoc, for example `/** @param {import('./updraft-plugin.d.ts').PluginContext} ctx */`. The API reference pages are generated from it, so they cannot drift from the contract.

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

    const stop = studio.on('time', draw);
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

Every other kind has a small example in the `examples/` folder of its guide.

## Module contract

The default export is an object. The app checks it when you add the plugin and shows the message of the first problem in the dialog.

Fields of every kind:

| Field      | Type                                                                           | Rule                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `string`                                                                       | `vendor/name`, each part matches `[a-z0-9-]{1,40}`, for example `acme/wind-panel`. Unique among plugins of all kinds and bundled plugins. Stable. The vendor `updraft` is reserved for bundled plugins, added plugins cannot use it. |
| `name`     | `string`                                                                       | Not blank. Shown to the user, for example as the panel title.                                                                                                                                                          |
| `kind`     | `'studio' \| 'service' \| 'backend' \| 'converter' \| 'xc-planner' \| 'badge'` | What the plugin extends.                                                                                                                                                                                               |
| `apiVersion` | `number`                                                                     | Per kind, see [Versioning](#versioning).                                                                                                                                                                               |
| `provides` | `Record<string, (ctx) => object>`                                              | Optional. Services this plugin offers, see [service](service/README.md).                                                                                                                                               |
| `requires` | `string[]`                                                                     | Optional. Services this plugin uses. `ctx.use` only hands out these.                                                                                                                                                   |

The fields of each kind are listed in its guide. Common checks that apply to all kinds:

- `"id" must look like "vendor/name", each part 1 to 40 characters from a-z, 0-9 and "-".`
- `"name" must be a non-empty string.`
- `"kind" must be one of "studio", "service", "backend", "converter", "xc-planner", "badge".`
- `"provides" must be an object of service factories.` and `The factory of "x" must be a function.`
- `The service name "x" must look like "vendor/service@1", with a-z, 0-9 and "-".`
- `"requires" must be a list of service names like "vendor/service@1".`

## ctx

Only a studio panel gets a `ctx`. It has `use(name)`, `overlay` and `need(kind)`, see [studio](studio/README.md#ctx-reference). A service factory gets a smaller context with `use(name)` only, see [service](service/README.md). Headless kinds without services have no `ctx`.

## Lifecycle

- An added plugin is known by its URL, id, name and the fields the app needs to list it, for example the dock of a panel or the extensions of a converter. The module is imported when it is needed, so an unused plugin costs nothing. Service plugins and backends are imported when the app starts or when the backend is used. Details are in each guide.
- The module is imported once per page load. After you change the file, reload the page to pick up the new version.
- Removing a plugin removes its entry, its layout slot, its services and its stored copy.

## Errors

The app never lets a plugin break other panels. Errors while adding a plugin:

| Failure                                    | What the user sees                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Bad URL when adding                        | In the dialog: "The address must be a valid http or https URL."                                                               |
| Same URL added twice                       | In the dialog: "This plugin is already added."                                                                                |
| Import error (network, CORS, syntax error) | In the dialog: "Could not load the plugin." followed by the browser message. Nothing is added.                                |
| Contract error (missing or bad field)      | In the dialog, the message of the first problem, for example `"dock" must be "left", "right" or "bottom".`. Nothing is added. |
| Page does not take the kind                | In the dialog: "This page only accepts X plugins."                                                                            |
| Id already used                            | In the dialog: `The id "..." is already in use.`                                                                              |
| Reserved `updraft/` id or service          | In the dialog: `The id "..." is reserved, "updraft/" is for bundled plugins.`                                                 |
| Service name already provided              | In the dialog: `Service "..." is already provided by "...".`                                                                  |

Runtime errors are shown where the plugin works, see the guide of the kind. Everything is also logged to the browser console with the plugin id.

A plugin that was added earlier but fails to load later, for example because the host is gone or the `id` in the file changed, fails in its own place only, the rest of the app keeps working.

## Offline and hosting

- Serve the plugin as one bundled file. Only that file is stored for offline use, so a plugin that imports other files from the network will not work offline.
- The host must send CORS headers (`Access-Control-Allow-Origin`), because the app imports the file from another origin. Same-origin files need no header.
- The app stores a copy of the file in the browser when you add the plugin. The service worker loads plugins network first, so an update on your host is used as soon as it is reachable, and the stored copy is used only when the network is not. The copy is refreshed on every successful load and deleted when the plugin is removed.
- The copy is made on a best effort basis. If it fails, the plugin still works online and a warning goes to the console.
- Files in the app's own `static/plugins/` folder are part of the app and are available offline with it.
- Only `https` URLs are accepted, plain `http` only for `localhost` and `127.0.0.1`.

## Versioning

Every kind of plugin has its own `apiVersion`. The studio kind is at `2`, the service, backend, converter, xc-planner and badge kinds at `1`. The app supports exactly these values. A plugin with any other value, or none, is refused, for example with "Unsupported apiVersion X, this studio supports 2." It is not mounted. Version 2 of the studio kind replaced the data members of `ctx` (`flights`, `time`, `selectedId`, `units`, `seek`, `select`, `viewer`) with `ctx.use('updraft/studio@1')`. Version 1 studio plugins are not supported.

## Security

A plugin is code from the internet that runs in the app page. There is no sandbox. It has the same access as the app itself, including every flight stored in this browser, the network and the page content. The app cannot see what a plugin does.

- Add only plugins from authors you trust, ideally with source you or someone you trust has read.
- A URL that points to a mutable file can change at any time. The app loads the current version on every load. Copy the file to a host you control if you want it to stay as reviewed.
- Subresource Integrity cannot protect a URL the user types in, so the app does not check a hash.
- Plugin authors should not send flight data anywhere without telling the user.

The dialog shows a warning before you add a plugin. Removing a plugin removes its entry, its layout slot and its stored copy.

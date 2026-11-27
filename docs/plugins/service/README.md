# Service plugins

A service is a named, versioned object. Plugins depend on services, never on other plugins, so any plugin that provides a service can stand in for another. A `service` plugin is headless: it has no panel and only provides services. Any plugin kind may also offer services with `provides`.

- Where it runs: in the page, as plain function calls. A service plugin is imported when the app starts, because a factory is only known after the import. Studio panels wait for it before they mount.
- How to load it: **Panels**, **Add plugin...** in the studio. The planner's Add plugin takes only `studio` and `xc-planner` plugins.
- Reference: [API reference](api.md) for the plugin, [services reference](reference/README.md) for the services the app provides.

## Fields

`apiVersion` is `1`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type                              | Rule                                                                                                                                                             |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'service'`                       | Required.                                                                                                                                                        |
| `apiVersion` | `1`                               | Required.                                                                                                                                                        |
| `provides`   | `Record<string, ServiceProvision>` | Required and not empty. Name `vendor/service@major`, each part matches `[a-z0-9-]{1,40}`. A value is `{ schema, create }`, `create` is `(ctx) => object`.       |
| `requires`   | `string[]`                        | Optional. Services the plugin uses.                                                                                                                              |

Validation messages:

- `Unsupported apiVersion X, services support 1.`
- `A service plugin must provide at least one service in "provides".`
- `The service name "x" must look like "vendor/service@1", with a-z, 0-9 and "-".`
- `The factory "create" of "x" must be a function.`
- `The service "x" needs a "schema" object.` and the other schema shape messages: the schema name must equal the key, `methods` must be an object, every method needs `access`, `params` and `returns`.
- `Service "x" is already provided by "y".` when the name is taken.
- `The service "updraft/x" is reserved, "updraft/" is for bundled plugins.`

## Rules

- Name: `vendor/service@major`, for example `updraft/studio@1`. The major version changes only when the contract breaks.
- `provides` maps a name to `{ schema, create }`. `create` is a factory `(ctx) => object`. `ctx.use(name)` inside a factory gets another service. A cycle throws a clear error.
- A factory runs on the first `use`, the result is cached and every caller gets the same object.
- The first provider of a name wins, a second one is refused. Added plugins cannot provide `updraft/` names.
- A studio plugin registers its services when its panel is loaded. Removing the plugin removes its services.
- Services named `updraft/*-state` hand out app internals and are internal to bundled plugins.

Performance: a service call is a plain function call in the page. Services are built on first use and return shared data without copying, so treat everything a service returns as read only and never modify it. A service may also offer write functions, for example `setRoute` and `setLeague` of `updraft/plan@1` or `setRange` of `updraft/studio@1`. A route set by a plugin can be undone by the user.

## Schemas and checked access

Every provided service ships a `ServiceSchema` next to its factory: the methods with their parameters and results, whether each method reads or writes, and the events. The format is a JSON Schema subset, see `ServiceSchema` and `JsonSchema` in the [API reference](api.md). Values are described with `type`, `enum`, `const`, `properties`, `required`, `additionalProperties`, `items`, `anyOf`, `$ref` into `$defs`, `minimum` and `maximum`. Numbers must be finite. `x-kind` marks what JSON cannot say: `function` for callbacks, `opaque` for host objects that cannot be described and are not checked, `void` for no result.

Access is checked when:

- an installed plugin (id outside `updraft/`) calls a service, through `ctx.use` or the `ctx.use` of a factory,
- an installed plugin provides the service and the app or a bundled plugin calls it,
- always in development and tests.

A checked call validates the parameters before and the result after (the resolved value for a method that returns a promise, `x-kind: promise` with `resolves`, a rejection passes through unchanged), and throws `Error('<service>.<method>: <message>')`, for example `updraft/studio@1.flights: flights()[0].fixes[3].lat: expected number`. `on` accepts the declared events only. A checked service exposes only the methods of its schema. A result object that passed once is not checked again, so services that return the same frozen object stay cheap. Calls between the app and bundled code are not checked in production, so per-frame calls stay fast.

The app lists every service with its schema on the API page (`/api`), linked from the Add plugin dialog. The schemas of the app's own services are generated from `src/lib/plugins/api.d.ts` and live in `src/lib/plugins/schemas/`.

## Events

Services with state that changes have `on(event, fn)`. It calls `fn` after the named event fired, at most once per animation frame. `fn` gets no payload, read the current values through the service functions. It does not fire for the state at the time you subscribe, so call your draw once yourself. It returns a function that stops it. Every subscription made through a service from `ctx.use` also stops on its own when the plugin unmounts. An unknown event throws `Unknown event "x" of updraft/studio@1.`. A handler that throws is shown in the panel's error box. The events of each service are listed on its reference page.

## Services of the app

Each service has a generated reference page with its events, members and types.

- [updraft/studio@1](reference/updraft-studio-1.md), provided by the studio. Flights, playback time, selection, display units, altitude reference and the Cesium viewer.
- [updraft/flight-analysis@1](reference/updraft-flight-analysis-1.md), provided by the studio. Statistics and transition summaries by flight id.
- [updraft/plan@1](reference/updraft-plan-1.md), provided by the planner. See the [XC planner host](../studio/README.md#the-xc-planner-host).
- [updraft/flights@1](reference/updraft-flights-1.md), provided on every page. The logbook: list, read tracks, save, edit and delete flights. Methods return promises.
- [updraft/prefs@1](reference/updraft-prefs-1.md), provided on every page. Units, altitude reference, XC league and thermal switches.
- [updraft/sync@1](reference/updraft-sync-1.md), provided on every page. Sync status and a manual sync.

## Example

[examples/wind.js](examples/wind.js) is a headless plugin that provides `me/wind@1`. The factory returns an object with one function, `at(lat, lon, alt)`, that gives a fixed demo wind. Another plugin lists `'me/wind@1'` in `requires` and calls `ctx.use('me/wind@1').at(...)`.

```js
export default {
  id: 'me/wind',
  name: 'Wind data',
  kind: 'service',
  apiVersion: 1,
  provides: {
    'me/wind@1': {
      schema: {
        name: 'me/wind@1',
        description: 'Wind lookup.',
        methods: {
          at: {
            description: 'The wind at a point.',
            access: 'read',
            params: [
              { name: 'lat', schema: { type: 'number' } },
              { name: 'lon', schema: { type: 'number' } },
              { name: 'alt', schema: { type: 'number' } }
            ],
            returns: { type: 'object', properties: { speed: { type: 'number' }, from: { type: 'number' } } }
          }
        }
      },
      create: () => ({ at: (lat, lon, alt) => ({ speed: 4, from: 270 }) })
    }
  }
};
```

## Document your own services

Generate the same kind of reference pages for services you provide, so authors who require your service can find them.

1. Put the service interfaces in a `.d.ts` file, for example `wind.d.ts`. Start the TSDoc of each service interface with a line ``Service `me/wind@1`.`` followed by what it is and where it is provided. Give every member a TSDoc comment, the generator fails otherwise.
2. For events, declare a string-literal union and give each member its own comment. Use it as the first parameter of `on`:

   ```ts
   /** Events of `WindService.on`. */
   export type WindEvent =
     /** New wind data arrived. */
     | 'data'
     /** The user picked another altitude. */
     | 'altitude';

   /**
    * Service `me/wind@1`. Provided by the wind plugin.
    * Wind speed and direction at a point.
    */
   export interface WindService {
     /** Calls `fn` after the named event fired. Returns a function that stops it. */
     on(event: WindEvent, fn: () => void): () => void;
     /** Wind in m/s and the direction it blows from, in degrees. */
     at(lat: number, lon: number, alt: number): { speed: number; from: number };
     /**
      * Sets the altitude the user looks at.
      * @write
      */
     setAltitude(alt: number): void;
   }
   ```

   Tag every method that changes state with `@write` on its own line in the TSDoc. Methods without it count as `read`.

3. Download the generator and run it. It only needs the `typescript` package, version 6 (version 7 has no JavaScript compiler API):

   ```sh
   npm i -D typescript@6
   curl -O https://raw.githubusercontent.com/linogics/updraft/main/scripts/gen-plugin-docs.mjs
   node gen-plugin-docs.mjs wind.d.ts docs schemas
   ```

   This writes `docs/service/reference/me-wind-1.md`, `docs/service/reference/README.md` and, because of the third argument, `schemas/me-wind-1.json`, the `ServiceSchema` of the service. Import that JSON in your plugin as `schema` and pass it with the factory: `provides: { 'me/wind@1': { schema, create } }`. String literal unions become `enum`, interfaces and aliases of the file become `$defs`, functions become `x-kind: function` and types from other files become `x-kind: opaque`. Interfaces and type aliases from the same file that the members use are listed on the page as well. An interface whose TSDoc contains ``Kind `name` `` also gets a page `docs/<name>/api.md`.

4. Commit the pages and link them from your plugin README, for example `Services: [me/wind@1](docs/service/reference/me-wind-1.md)`.

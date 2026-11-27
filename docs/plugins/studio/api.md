# `studio` plugin: API reference

Generated from `api.d.ts`, do not edit.

A panel in a dock, apiVersion 2.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`, for example `acme/wind-panel`. Unique among plugins and built-in panels. Stable, it identifies the panel in the saved layout. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. Shown as the panel title, in the Panels menu and in the export dialogs. |
| `kind` | `'studio'` | Must be `'studio'`. |
| `apiVersion` | `2` | Must be `2`. Any other value is refused with `Unsupported apiVersion X, this studio supports 2.`. |
| `dock` | `PluginDock` | The dock the panel starts in. |
| `hosts?` | `PluginHost[]` | Pages that show the panel, defaults to `['studio']`. A non-empty list without duplicates. |
| `mount` | `(el: HTMLElement, ctx: PluginContext): void \| (() => void)` | Called when the panel is shown, again with a fresh `el` and `ctx` each time it is shown. `el` is an empty div that fills the panel body. Write to it with `textContent` or DOM calls, not `innerHTML`, when the text comes from flight files. The returned function is called once when the panel is hidden or the plugin is removed. Stop timers, listeners and anything else you started there. |
| `drawExport?` | `?(ctx2d: CanvasRenderingContext2D, time: number): void` | Paints onto image and video exports. `ctx2d` is the 2D context of the export frame, `time` is the studio playback time of that frame in ms. It must be synchronous, a returned promise is ignored. The frame size is `ctx2d.canvas.width` by `ctx2d.canvas.height`. The canvas state is restored after each plugin. It has no `ctx`, keep the studio service from `mount` in a module variable if you need flight data. |
| `provides?` | `Record<string, ServiceProvision>` | Services this plugin offers, by name `vendor/service@major`, each part matching `[a-z0-9-]{1,40}`. Each comes with its `schema`. The first provider of a name wins, a second one is refused. The vendor `updraft` is reserved. Removing the plugin removes its services. |
| `requires?` | `string[]` | Services this plugin uses. `ctx.use` only hands out these. |

## Types

### PluginDock

A dock a panel can sit in. The user can move the panel afterwards.

```ts
type PluginDock = 'left' | 'right' | 'bottom';
```

### PluginHost

A page that can show a panel. `'plan'` is the XC planner.

```ts
type PluginHost = 'studio' | 'plan';
```

### NeedKind

Background work a plugin can ask the studio for. `'xc'` scores the flights, `'ground'` loads ground heights.

```ts
type NeedKind = 'xc' | 'ground';
```

### ServiceContext

What a service factory gets.

| Field | Type | Description |
| --- | --- | --- |
| `use` | `<T = unknown>(name: string): T` | Another service this one depends on. Built on first use. A cycle throws a clear error. |

### ServiceFactory

Builds a service on its first use. The result is cached and every caller gets the same object.
Treat everything a service returns as read only. A service may also offer write functions, documented per
service. The data they return stays read only.

```ts
type ServiceFactory = (ctx: ServiceContext) => object;
```

### JsonSchema

The JSON Schema subset that describes values in a service schema. Numbers must be finite.
`$ref` only points into `$defs` of the same service schema, as `#/$defs/Name`.

| Field | Type | Description |
| --- | --- | --- |
| `type?` | `'string' \| 'number' \| 'integer' \| 'boolean' \| 'null' \| 'object' \| 'array'` | The JSON type. `number` rejects `NaN` and infinities, `integer` is a whole number. |
| `enum?` | `(string \| number \| boolean \| null)[]` | The value must be one of these. |
| `const?` | `unknown` | The value must equal this. |
| `properties?` | `Record<string, JsonSchema>` | Schemas of the named fields of an object. Extra fields are allowed. |
| `required?` | `string[]` | Names of the fields that must be present, which means not `undefined`. |
| `additionalProperties?` | `boolean \| JsonSchema` | `false` forbids extra fields, a schema checks every field that is not in `properties`. |
| `items?` | `JsonSchema` | Schema of every item of an array. |
| `anyOf?` | `JsonSchema[]` | The value must match at least one of these. |
| `$ref?` | `string` | Reference to a shared schema, `#/$defs/Name`. |
| `minimum?` | `number` | Lower bound of a number, inclusive. |
| `maximum?` | `number` | Upper bound of a number, inclusive. |
| `description?` | `string` | Human readable text, shown in the API explorer. |
| `'x-kind'?` | `'function' \| 'opaque' \| 'void'` | `function` is a callback or a function value, `opaque` is a host object that cannot be described and is not checked, for example the Cesium viewer, `void` is the absence of a value. |

### ServiceMethodSchema

One method of a service.

| Field | Type | Description |
| --- | --- | --- |
| `description` | `string` | What the method does. Shown in the API explorer. |
| `access` | `'read' \| 'write'` | `read` returns data and changes nothing, `write` changes state. Generated from the `@write` TSDoc tag. |
| `params` | `{ name: string; optional?: boolean; schema: JsonSchema }[]` | The parameters in call order. |
| `returns` | `JsonSchema` | The result. A method without a result returns `{ "x-kind": "void" }`. |

### ServiceSchema

The machine readable description of one service: methods with parameters, results and whether they write,
and events. Plugins ship it next to the factory. Generate it from your own `.d.ts` with `scripts/gen-plugin-docs.mjs`.
Calls across an installed plugin are checked against it, a call or result that does not match throws.

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | The service name, the same as the key in `provides`. |
| `description` | `string` | What the service is for. Shown in the API explorer. |
| `methods` | `Record<string, ServiceMethodSchema>` | The methods by name. A function `on(event, fn)` is not listed, declare `events` instead. |
| `events?` | `Record<string, { description: string }>` | The events `on` accepts, by name. Leave it out for a service without `on`. |
| `$defs?` | `Record<string, JsonSchema>` | Shared schemas that `$ref` points to. |

### ServiceProvision

What a plugin offers under one service name.

| Field | Type | Description |
| --- | --- | --- |
| `schema` | `ServiceSchema` | Describes the service, see `ServiceSchema`. |
| `create` | `ServiceFactory` | Builds the service on its first use. |

### PluginContext

What a mounted studio plugin gets. Data comes from services, see `StudioService`. It is frozen.

| Field | Type | Description |
| --- | --- | --- |
| `use` | `<T = unknown>(name: string): T` | A service named in the plugin's `requires`. Any other name throws `Service "x" is not in requires.`. A missing provider throws too, but the panel is not mounted at all in that case, the user sees which services are missing. |
| `overlay` | `HTMLDivElement` | A div over the 3D and 2D views, owned by the plugin. It has `position: absolute`, fills the views and has `pointer-events: none`, so clicks pass through. Set `pointer-events: auto` on your own children that need clicks. The studio removes it on unmount. In the planner it covers the map. |
| `need` | `(kind: NeedKind): () => void` | Asks the studio to run background work for as long as the plugin is mounted. Returns a release function. Every need is released on unmount. Any other `kind` throws. In the planner it throws `need is not available in the planner.`. |

# `xc-planner` plugin: API reference

Generated from `api.d.ts`, do not edit.

An extension of the XC planner, apiVersion 1: headless, it adds export buttons and scoring leagues.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. |
| `kind` | `'xc-planner'` | Must be `'xc-planner'`. |
| `apiVersion` | `1` | Must be `1`. |
| `exports?` | `PlanExport[]` | Task file formats, 1 to 10. Extensions must be unique within the plugin, other plugins may reuse them. |
| `leagues?` | `PlanLeague[]` | XC scoring leagues, 1 to 20. They apply everywhere the app scores. At least one of `exports` and `leagues` is needed. |
| `provides?` | `Record<string, ServiceFactory>` | Services this plugin offers, by name `vendor/service@major`, each part matching `[a-z0-9-]{1,40}`. The first provider of a name wins, a second one is refused. The vendor `updraft` is reserved. Removing the plugin removes its services. |
| `requires?` | `string[]` | Services this plugin uses. `ctx.use` only hands out these. |

## Types

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

### PlanRoute

A planned route as export plugins get it.

| Field | Type | Description |
| --- | --- | --- |
| `points` | `readonly Readonly<{ lat: number; lon: number }>[]` | Turnpoints in order, at least 2. |
| `speed` | `number` | Planned speed in km/h. |

### PlanExport

One file format a planned route can be saved as.

| Field | Type | Description |
| --- | --- | --- |
| `label` | `string` | Shown on the export button, for example `XCTrack task`. Not blank. |
| `extension` | `string` | Lower case file extension without the dot, 1 to 10 characters from `[a-z0-9]`. |
| `mime?` | `string` | Media type of the file. Defaults to `application/octet-stream`. |
| `write` | `(route: PlanRoute): string \| Uint8Array` | Builds the file content. Text is stored as UTF-8. |

### LeagueRule

One route type a league scores.

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Shown to the user, for example `FAI triangle`. Not blank. |
| `type` | `'free' \| 'flat' \| 'fai' \| 'oar' \| 'oar2'` | `free`: distance via up to 3 turnpoints. `flat`: triangle. `fai`: FAI triangle. `oar`: out-and-return via 1 turnpoint. `oar2`: out-and-return via 2 turnpoints. |
| `multiplier` | `number` | Points per km, greater than 0, at most 10. |
| `minSide?` | `number` | Shortest side of a triangle as a share of the total, greater than 0 and below 0.5. `fai` only defaults to 0.28, `flat` has none unless set. |
| `maxSide?` | `number` | Longest side of a triangle as a share of the total, between 0 and 1, `flat` only. Must be above `minSide`. |
| `minDistance?` | `number` | Shortest route in km that scores at all, 0 to 1000. |
| `closing?` | `{ fixed?: number; free?: number; relative?: number }` | Closing gap allowed for triangles and out-and-returns, all in km, each 0 to 100 and `relative` 0 to 1. The gap is max(fixed, relative * route length). Not for `free`. |
| `cylinders?` | `number` | FAI cylinders in km, 0 to 5. Turnpoints are moved out by this radius. |
| `decimals?` | `1 \| 2` | Decimals of the final score, 1 or 2, default 2. |

### PlanLeague

A scoring league made of declarative rules, so scoring never runs plugin code.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique within the plugin, `[a-z0-9-]{1,40}`. The app stores it as `<plugin id>:<id>`. |
| `label` | `string` | Shown in the league pickers. Not blank. |
| `rules` | `LeagueRule[]` | 1 to 10 rules, the best scoring one wins. |

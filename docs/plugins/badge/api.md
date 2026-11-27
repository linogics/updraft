# `badge` plugin: API reference

Generated from `api.d.ts`, do not edit.

A set of badges, apiVersion 1: headless, the app shows the tiers a pilot reached.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. |
| `kind` | `'badge'` | Must be `'badge'`. |
| `apiVersion` | `1` | Must be `1`. |
| `badges` | `BadgeDef[]` | 1 or more, ids unique within the plugin. |
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

### BadgeUnit

The quantity a badge measures. Thresholds and values are SI: metres, m/s, seconds, or a plain count.

```ts
type BadgeUnit = 'distance' | 'speed' | 'duration' | 'altitude' | 'vario' | 'count';
```

### BadgeFlight

One flight as badges see it. Everything is SI, so convert for display only.

| Field | Type | Description |
| --- | --- | --- |
| `date` | `string` | Flight date, `YYYY-MM-DD`. |
| `site` | `string \| null` | Takeoff site name, or null when unknown. May be blank or differ in case between flights. |
| `glider` | `string \| null` | Glider name, or null when unknown. May be blank or differ in case between flights. |
| `durationS` | `number` | Airtime in seconds. |
| `freeDistance` | `number` | Free distance in metres, the furthest of the free route and the distance from takeoff. |
| `maxAltMsl` | `number` | Highest altitude in metres above sea level. |
| `maxGain` | `number` | Highest altitude minus takeoff altitude, in metres. |
| `maxAgl?` | `number` | Highest height above ground in metres. Missing when no ground heights were available. |
| `bestClimb` | `number` | Best average climb of one thermal in m/s. |
| `bestThermalGain` | `number` | Biggest altitude gain of one thermal in metres. |
| `xc?` | `{ /** Route type: `free`, `flat` (flat triangle), `fai` (FAI triangle), `oar` or `oar2` (out-and-return). */ kind: string; /** Route length in metres. */ distance: number; /** Average speed in m/s from the first to the last route point. Missing for closed routes. */ speed?: number; }` | The best scored route of the flight, missing when none scored. |

### BadgeDef

One tiered achievement. The tier is the highest threshold that `value` reaches.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique within the plugin, `[a-z0-9-]{1,40}`. |
| `label` | `string` | Shown to the user, for example `Longest flight`. Not blank. |
| `unit` | `BadgeUnit` | The quantity the badge measures, it tells the app how to display the value. |
| `thresholds` | `number[]` | The values for Bronze, Silver, Gold, Platinum, Diamond, Cloudbase, Stratos and Legend, in that order. Exactly 8 finite numbers above 0, strictly increasing, in the SI unit of `unit`. |
| `value` | `(flights: BadgeFlight[]): number` | The badge value over all flights of a pilot, in any order. Return a finite number of 0 or more. It must never drop when a flight is added, like a maximum or a count. Anything else counts as 0. |

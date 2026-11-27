# `converter` plugin: API reference

Generated from `api.d.ts`, do not edit.

One track file format, apiVersion 1. A plugin reads and/or writes its format, the app converts through its own
flight model. Data that `PluginTrack` has no field for is lost.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. |
| `kind` | `'converter'` | Must be `'converter'`. |
| `apiVersion` | `1` | Must be `1`. |
| `label` | `string` | Format name shown to the user, for example `IGC`. Not blank. |
| `extensions` | `string[]` | Lower case file extensions without the dot, 1 to 10 characters from `[a-z0-9]`, no duplicates. The first one is used for written files. An extension already handled by another converter is refused. |
| `mime?` | `string` | Media type of written files. Defaults to `application/octet-stream`. |
| `read?` | `?(file: File): PluginTrack \| Promise<PluginTrack>` | Parses a file. Throw an Error with a message for the user when it is not valid. The app validates the result. |
| `write?` | `?(track: PluginTrack): string \| Uint8Array` | Builds the file content. Text is stored as UTF-8. |
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

### PluginTrack

A track as plugins see it. Times in Unix ms, altitude in m, positions in degrees.

| Field | Type | Description |
| --- | --- | --- |
| `pilot` | `string` | Pilot name. |
| `glider` | `string \| null` | Glider name, or null when unknown. |
| `site` | `string \| null` | Takeoff site name, or null when unknown. |
| `date` | `string` | Flight date, `YYYY-MM-DD`. |
| `fixes` | `readonly Readonly<{ t: number; lat: number; lon: number; alt: number }>[]` | At least one fix, `t` never decreasing. |

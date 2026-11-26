# updraft/studio@1

Service `updraft/studio@1`. Provided by the studio while it is open, not by the planner.
Every value is read through a function, so it is always current. Call the function again instead of keeping its result.

## Events

Subscribe with `on(event: StudioEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `time` | The playback time changed. |
| `flights` | The pilot list changed: a flight was added or removed, or a color, visibility (also `setVisible`) or time shift changed. |
| `selection` | The selected pilot changed. |
| `units` | The user changed the display units. |
| `altRef` | The user changed the altitude reference. |
| `league` | The scoring league changed. |
| `playing` | Playback started or stopped. |
| `range` | The effective range changed: the timeline marks, or the studio start and end while they are unset. |

## Members

| Member | Description |
| --- | --- |
| `flights(): readonly PluginFlight[]` | All pilots in the studio, in list order. The same frozen array until flights, colors or visibility change. |
| `time(): number` | Playback time in ms on the studio clock. |
| `selectedId(): string \| null` | Id of the selected pilot, or null. |
| `units(): Readonly<Units>` | The display units the user chose. The same frozen object until the user changes them. |
| `altRef(): AltRef` | The altitude reference the user chose for transition altitudes. |
| `seek(ms: number): void` | Moves playback to `ms` on the studio clock. The studio clamps it to the playable range. |
| `select(id: string): void` | Selects the pilot with that flight id. An unknown id is ignored. |
| `setVisible(id: string, visible: boolean): void` | Shows or hides the pilot with that flight id. An unknown id is ignored. Anything but a boolean throws `Visible must be true or false.`. Fires `flights`. |
| `league(): string` | Id of the scoring league in use. Plugin leagues are `<plugin id>:<league id>`. `XContest` when the chosen one was removed. |
| `leagues(): readonly Readonly<{ id: string; label: string }>[]` | All scoring leagues, bundled and from plugins. The same frozen array until the list changes. |
| `setLeague(id: string): void` | Switches the scoring league like the user would, so scores of the old league are dropped and scoring restarts. An unknown id throws `Unknown league "x".`. The current league is a no-op. |
| `play(): void` | Starts playback. A no-op while playing. At the end it starts again from the beginning. |
| `pause(): void` | Stops playback. A no-op while paused. |
| `playing(): boolean` | Whether playback is running. |
| `range(): Readonly<{ start: number; end: number }>` | The in and out marks of the timeline, which set the video export range, in ms on the studio clock. Unset marks read as the studio start and end. The same frozen object until a mark or the studio range changes. |
| `setRange(start: number, end: number): void` | Sets both marks. Both must be finite numbers with `start` before `end`, otherwise it throws `Range start and end must be finite numbers.` or `Range start must be before end.`. Values outside the studio range are clamped into it first, and the clamped values must still be in order, so a range entirely outside the studio throws `Range start must be before end.` too. |
| `clearRange(): void` | Removes both marks, so the export covers the whole studio range. |
| `viewer(): Viewer \| null` | The Cesium viewer. Null while there is no 3D view, for example in the 2D map, so check it every time. |

## Types

### AltRef

The altitude reference for transition altitudes.

```ts
type AltRef = 'msl' | 'agl';
```

### Units

The four display units. Values from the studio are always SI, convert them for display.

| Field | Type | Description |
| --- | --- | --- |
| `distance` | `'km' \| 'mi' \| 'nm'` | Distances: kilometres, miles or nautical miles. |
| `alt` | `'m' \| 'ft'` | Altitudes: metres or feet. |
| `vario` | `'ms' \| 'fpm' \| 'kt'` | Climb and sink rates: m/s, feet per minute or knots. |
| `speed` | `'kmh' \| 'mph' \| 'kt'` | Speeds: km/h, mph or knots. |

### PluginFlight

One pilot in the studio.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Flight id, the value for `StudioService.selectedId()` and `select()`. |
| `pilot` | `string` | Pilot name. |
| `glider` | `string \| null` | Glider, if the file has one. |
| `color` | `string` | The pilot colour as a CSS colour. |
| `visible` | `boolean` | Whether the pilot is shown. |
| `fixes` | `readonly { t: number; lat: number; lon: number; alt: number }[]` | Track points sorted by time. `t` is in ms on the studio clock, so time shifts of the pilot are already applied. `lat` and `lon` are degrees, `alt` is metres. Shared with the studio, do not modify it or its objects. |

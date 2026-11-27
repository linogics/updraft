# updraft/prefs@1

Service `updraft/prefs@1`. The personal preferences of the user, kept in this browser, provided by the app on every page.
The ion token and API keys are not part of it.

## Events

Subscribe with `on(event: PrefsEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `units` | The user or a plugin changed the display units. |
| `altRef` | The altitude reference changed. |
| `league` | The scoring league changed. |
| `thermals` | The thermal columns or labels switched on or off. |

## Members

Methods marked `write` change state, the others only read.

| Member | Access | Description |
| --- | --- | --- |
| `units(): Readonly<Units>` | read | The display units. The same frozen object until they change. |
| `setUnits(units: Units): void` | write | Sets the display units. Throws `Invalid units.` when a field is not one of its allowed values. |
| `altRef(): AltRef` | read | The altitude reference. |
| `setAltRef(ref: AltRef): void` | write | Sets the altitude reference. Throws `Invalid altitude reference.` for any other value than `msl` or `agl`. |
| `league(): string` | read | Id of the active XC scoring league. `XContest` when the chosen one was removed. |
| `setLeague(id: string): void` | write | Switches the XC league for the whole app. An unknown id throws `Unknown league "x".`. |
| `thermalColumns(): boolean` | read | Whether the thermal columns are drawn in the 3D view. |
| `thermalLabels(): boolean` | read | Whether the thermal labels are drawn in the 3D view. |
| `setThermals(prefs: { columns?: boolean; labels?: boolean }): void` | write | Shows or hides the thermal columns and labels. A value that is left out stays as it is. Throws `Thermal switches must be true or false.` for a value that is not a boolean. |

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

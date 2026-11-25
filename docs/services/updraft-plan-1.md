# updraft/plan@1

Service `updraft/plan@1`. Provided by the planner while it is open, not by the studio.
Everything is read through functions, so it is always current.

## Events

Subscribe with `on(event: PlanEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `route` | The route changed. |
| `speed` | The planned speed changed. |
| `units` | The user changed the display units. |

## Members

| Member | Description |
| --- | --- |
| `points(): readonly Readonly<{ lat: number; lon: number }>[]` | The route. The same frozen array until the route changes. |
| `distance(): number` | Route length in m. |
| `speed(): number` | Planned speed in km/h. |
| `units(): Readonly<Units>` | The same frozen object until the user changes units. |

## Types

### Units

The four display units. Values from the studio are always SI, convert them for display.

| Field | Type | Description |
| --- | --- | --- |
| `distance` | `'km' \| 'mi' \| 'nm'` | Distances: kilometres, miles or nautical miles. |
| `alt` | `'m' \| 'ft'` | Altitudes: metres or feet. |
| `vario` | `'ms' \| 'fpm' \| 'kt'` | Climb and sink rates: m/s, feet per minute or knots. |
| `speed` | `'kmh' \| 'mph' \| 'kt'` | Speeds: km/h, mph or knots. |

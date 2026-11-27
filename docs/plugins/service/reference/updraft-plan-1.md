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
| `league` | The XC scoring league changed. |

## Members

Methods marked `write` change state, the others only read.

| Member | Access | Description |
| --- | --- | --- |
| `points(): readonly Readonly<{ lat: number; lon: number }>[]` | read | The route. The same frozen array until the route changes. |
| `distance(): number` | read | Route length in m. |
| `speed(): number` | read | Planned speed in km/h. |
| `units(): Readonly<Units>` | read | The same frozen object until the user changes units. |
| `setRoute(points: readonly { lat: number; lon: number }[]): void` | write | Replaces the whole route. The user can undo it in the planner, as one step. An empty array clears the route. Throws when the argument is not an array, has more than 100 points, or a point lacks a finite `lat` in [-90, 90] or `lon` in [-180, 180]. The points are copied. |
| `league(): string` | read | Id of the active XC scoring league. Plugin leagues are `<plugin id>:<league id>`. `XContest` when the chosen one was removed. |
| `leagues(): readonly Readonly<{ id: string; label: string }>[]` | read | The leagues the user can pick. The same frozen array until the list changes. |
| `setLeague(id: string): void` | write | Switches the XC league for the whole app, it is a global preference. An unknown id throws `Unknown league "x".`. |

## Types

### Units

The four display units. Values from the studio are always SI, convert them for display.

| Field | Type | Description |
| --- | --- | --- |
| `distance` | `'km' \| 'mi' \| 'nm'` | Distances: kilometres, miles or nautical miles. |
| `alt` | `'m' \| 'ft'` | Altitudes: metres or feet. |
| `vario` | `'ms' \| 'fpm' \| 'kt'` | Climb and sink rates: m/s, feet per minute or knots. |
| `speed` | `'kmh' \| 'mph' \| 'kt'` | Speeds: km/h, mph or knots. |

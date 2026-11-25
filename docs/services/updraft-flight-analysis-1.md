# updraft/flight-analysis@1

Service `updraft/flight-analysis@1`. Provided by the studio while it is open, not by the planner.
Lookups are by flight id and return null for an unknown id. Results are the studio's own objects, read only.

## Events

Subscribe with `on(event: AnalysisEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `changed` | Flights changed or ground heights arrived, so stats and transitions may differ. |

## Members

| Member | Description |
| --- | --- |
| `stats(id: string): FlightStats \| null` | Duration, distances, altitudes, max climb and sink, glide ratio and phase shares of the flight. |
| `transitions(id: string, ref: AltRef): TransitionSummary \| null` | Summary of the glides between climbs, with altitudes in `'msl'` or `'agl'`. AGL values are null until ground heights have loaded, so hold `ctx.need('ground')` while asking for them. |

## Types

### AltRef

The altitude reference for transition altitudes.

```ts
type AltRef = 'msl' | 'agl';
```

### FlightStats

Statistics of one flight. All values are SI.

| Field | Type | Description |
| --- | --- | --- |
| `duration` | `number` | Seconds. |
| `trackLength` | `number` | Metres along the track. |
| `straightDistance` | `number` | Metres, straight line takeoff to landing. |
| `maxDistanceFromTakeoff` | `number` | Metres, furthest point from takeoff. |
| `maxAlt` | `number` |  |
| `minAlt` | `number` |  |
| `takeoffAlt` | `number` |  |
| `landingAlt` | `number` |  |
| `maxClimb` | `number` |  |
| `maxSink` | `number` |  |
| `phaseShare` | `Record<'thermalling' \| 'gliding' \| 'searching', number>` | Share of time per phase, 0..1. |
| `glideRatio` | `number \| null` | Average glide ratio over gliding phases, null if none. |

### TransitionSummary

Transition altitudes: where climbs were left and the next one found. Glides only.

| Field | Type | Description |
| --- | --- | --- |
| `count` | `number` |  |
| `avgStartAlt` | `number \| null` |  |
| `avgEndAlt` | `number \| null` |  |
| `lowestArrival` | `number \| null` |  |
| `avgGlideRatio` | `number \| null` |  |
| `avgSpeed` | `number \| null` | m/s. |

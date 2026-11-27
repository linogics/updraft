# updraft/flight-analysis@1

Service `updraft/flight-analysis@1`. Provided by the studio while it is open, not by the planner.
Lookups are by flight id and return null for an unknown id. Results are the studio's own objects, read only.

## Events

Subscribe with `on(event: AnalysisEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `changed` | Flights changed or ground heights arrived, so stats and transitions may differ. |

## Members

Methods marked `write` change state, the others only read.

| Member | Access | Description |
| --- | --- | --- |
| `stats(id: string): FlightStats \| null` | read | Duration, distances, altitudes, max climb and sink, glide ratio and phase shares of the flight. |
| `transitions(id: string, ref: AltRef): TransitionSummary \| null` | read | Summary of the glides between climbs, with altitudes in `'msl'` or `'agl'`. AGL values are null until ground heights have loaded, so hold `ctx.need('ground')` while asking for them. |

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
| `maxAlt` | `number` | Highest altitude in metres. |
| `minAlt` | `number` | Lowest altitude in metres. |
| `takeoffAlt` | `number` | Altitude at takeoff in metres. |
| `landingAlt` | `number` | Altitude at landing in metres. |
| `maxClimb` | `number` | Best climb rate in m/s. |
| `maxSink` | `number` | Worst sink rate in m/s, a negative number. |
| `phaseShare` | `Record<'thermalling' \| 'gliding' \| 'searching', number>` | Share of time per phase, 0..1. |
| `glideRatio` | `number \| null` | Average glide ratio over gliding phases, null if none. |

### TransitionSummary

Transition altitudes: where climbs were left and the next one found. Glides only.

| Field | Type | Description |
| --- | --- | --- |
| `count` | `number` | Number of glides. |
| `avgStartAlt` | `number \| null` | Average altitude where the glides started, in metres. Null when there is none. |
| `avgEndAlt` | `number \| null` | Average altitude where the glides ended, in metres. Null when there is none. |
| `lowestArrival` | `number \| null` | Lowest altitude where a glide ended, in metres. Null when there is none. |
| `avgGlideRatio` | `number \| null` | Average glide ratio of the glides. Null when there is none. |
| `avgSpeed` | `number \| null` | m/s. |

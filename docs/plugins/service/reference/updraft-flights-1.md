# updraft/flights@1

Service `updraft/flights@1`. The logbook stored in this browser, provided by the app on every page.
Listings carry no track points, read them with `track`.

## Events

Subscribe with `on(event: FlightsEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `changed` | The logbook changed: a flight or manual entry was saved, edited, deleted, imported or restored, or a sync pulled changes. Also fires for other local writes that sync, such as camera paths. |

## Members

Methods marked `write` change state, the others only read.

| Member | Access | Description |
| --- | --- | --- |
| `list(): Promise<readonly FlightSummary[]>` | read | All entries, manual ones included, newest first. |
| `get(id: string): Promise<FlightSummary \| null>` | read | One entry by id, or null when there is none. |
| `track(id: string): Promise<readonly Fix[] \| null>` | read | The track points of a flight, sorted by time. Null for a manual entry or an unknown id. |
| `save(flight: Flight): Promise<string>` | write | Stores a flight, or replaces the one with the same id. Resolves to the flight id. Rejects when the flight has no fixes. |
| `saveManual(entry: ManualEntry): Promise<string>` | write | Stores a manual entry, or replaces the one with the same `id`. Resolves to the entry id. |
| `updateMeta(id: string, patch: MetaPatch): Promise<void>` | write | Changes the pilot, glider, site or notes of an entry. An unknown id does nothing. |
| `delete(id: string): Promise<void>` | write | Deletes a flight or manual entry with its cached scores. An unknown id does nothing. |

## Types

### Fix

One track point.

| Field | Type | Description |
| --- | --- | --- |
| `t` | `number` | Unix epoch milliseconds (UTC). |
| `lat` | `number` | Latitude in degrees. |
| `lon` | `number` | Longitude in degrees. |
| `alt` | `number` | Altitude in metres as recorded, GPS or pressure altitude. |

### Flight

A parsed flight with its track.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Flight id. |
| `sourceName` | `string` | Name of the file or source the flight came from. |
| `pilot` | `string` | Pilot name. |
| `glider` | `string \| null` | Glider, if known. |
| `site` | `string \| null` | Launch site, if known. |
| `date` | `string` | Flight date, ISO 8601 (YYYY-MM-DD). |
| `notes?` | `string` | Free text notes. |
| `shared?` | `boolean` | Opted in to the club list of the sync server. |
| `fixes` | `Fix[]` | Track points sorted by time. Not empty. |

### FlightSummary

A logbook entry without its track, for listings.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Flight id. |
| `sourceName` | `string` | Name of the file or source the flight came from. Empty for a manual entry. |
| `pilot` | `string` | Pilot name. |
| `glider` | `string \| null` | Glider, if known. |
| `site` | `string \| null` | Launch site, if known. |
| `date` | `string` | Flight date, ISO 8601 (YYYY-MM-DD). |
| `fixCount` | `number` | Number of track points, 0 for a manual entry. |
| `startTime` | `number` | Time of the first fix in epoch ms. For a manual entry, noon of the date. |
| `endTime` | `number` | Time of the last fix in epoch ms. |
| `notes?` | `string` | Free text notes. |
| `maxAlt?` | `number` | Highest fix altitude in metres. |
| `trackKm?` | `number` | Track length in km. |
| `manual?` | `true` | Logged by hand, no track stored. |
| `shared?` | `boolean` | Opted in to the club list. |

### ManualEntry

A flight logged by hand, without a track.

| Field | Type | Description |
| --- | --- | --- |
| `id?` | `string` | An existing id replaces that entry, leave it out for a new one. |
| `date` | `string` | Flight date, ISO 8601 (YYYY-MM-DD). |
| `pilot` | `string` | Pilot name. |
| `glider` | `string \| null` | Glider, if known. |
| `site` | `string \| null` | Launch site, if known. |
| `durationMin` | `number` | Airtime in minutes. |
| `notes` | `string` | Free text notes. |

### MetaPatch

The fields of a logbook entry that can be changed. A field that is left out stays as it is.

| Field | Type | Description |
| --- | --- | --- |
| `pilot?` | `string` | Pilot name. |
| `glider?` | `string \| null` | Glider, null clears it. |
| `site?` | `string \| null` | Launch site, null clears it. |
| `notes?` | `string` | Free text notes. |

# updraft/sync@1

Service `updraft/sync@1`. The sync of the logbook with a server, provided by the app on every page.
Signing in and out stays with the user.

## Events

Subscribe with `on(event: SyncEvent, fn: () => void): () => void`.

| Event | When it fires |
| --- | --- |
| `status` | The status changed: signed in or out, a server was chosen or forgotten, a sync started or ended. |

## Members

Methods marked `write` change state, the others only read.

| Member | Access | Description |
| --- | --- | --- |
| `status(): SyncInfo` | read | The current sync state. A new object on every call. |
| `syncNow(): Promise<void>` | write | Runs a sync now. Resolves when it ended, also when nothing ran because the user is not signed in or a sync just ran. Failures show in the sync panel of the app and never reject. |

## Types

### SyncInfo

The state of the sync with a server.

| Field | Type | Description |
| --- | --- | --- |
| `signedIn` | `boolean` | Whether the user is signed in to a server. |
| `url` | `string \| null` | Address of the chosen server, or null when none is chosen. |
| `lastSyncAt` | `number \| null` | Time of the last finished sync in epoch ms, or null when none ran yet. |
| `busy` | `boolean` | Whether a sync is running right now. |

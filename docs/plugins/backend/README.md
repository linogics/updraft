# Backend plugins

A `backend` plugin connects the sync engine to a server. `create({ url })` returns a `BackendAdapter`, which is a `SyncTransport` (`push(changes)` and `pull(cursor)`, see Sync in [development.md](../../development.md)) plus login.

- Where it runs: in the page, when the user connects sync. The module is imported when the backend is used.
- How to load it: **Panels**, **Add plugin...** in the studio, then pick it in the backend list of the logbook Sync panel. The bundled backend is `updraft/pocketbase`, see [self-hosting-sync.md](../../self-hosting-sync.md).
- Reference: [API reference](api.md).

## Fields

`apiVersion` is `1`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type                                              | Rule                                                      |
| ------------ | ------------------------------------------------- | --------------------------------------------------------- |
| `kind`       | `'backend'`                                       | Required.                                                 |
| `apiVersion` | `1`                                               | Required.                                                 |
| `create`     | `(config: { url: string }) => BackendAdapter`     | Required. Builds the adapter for the server at `config.url`. |

Validation messages:

- `Unsupported apiVersion X, backends support 1.`
- `"create" must be a function.`

The app also refuses to use a module whose id or kind differs from the stored one: `"x" is not a sync backend.`

## The adapter

| Member          | Rule                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authMethods()` | Lists what the server offers. `{ kind: 'password' }` makes the app show an identity and password form and pass `{ identity, password }` as `input`. `{ kind: 'redirect', id, label }` is OAuth or SSO, the adapter runs the popup or redirect itself, so `signIn` is called from a click. `{ kind: 'code', label }` is reserved for one time codes and not used yet. |
| `signIn(method, input?)` | Returns a `BackendSession` `{ user }`.                                                                                                            |
| `signOut()`     | Ends the session.                                                                                                                                          |
| `session()`     | The stored session or `null`.                                                                                                                              |
| `push(changes)` | Stores the changes.                                                                                                                                        |
| `pull(cursor)`  | Returns `{ changes, cursor, more? }`.                                                                                                                      |
| `club?`         | Optional, see below.                                                                                                                                       |

Rules:

- The adapter owns the token. It keeps it in its own storage, so `session()` still answers after a reload, and the app never sees it. Use a storage key that includes `url`.
- `push` must apply last write wins per record: a change only replaces the stored one when its `updatedAt` is higher.
- `pull` returns changes in a stable order after an opaque `cursor`, and `more: true` while there are further pages.
- A deleted record is a change with `deleted: true` and no `data`.
- `pull` returns only the signed in account's own records, even when the server lets the account read other records. Shared flights of other pilots must not land in this logbook.
- The app sends validated records. It treats everything from `pull` as untrusted and validates it again, so the adapter does not have to, but it must not run or render it.

### Club

Optional `club`: `list()` returns `{ key, owner, mine, stats }` for every flight that pilots shared, without the tracks. `key` is a server id, `owner` is an opaque account id that groups the flights of one pilot, and `stats` is the `club` summary of the flight record. `flight(key)` returns the full record of one shared flight. A flight record is shared when its `data.shared` is `true`, so a backend that supports the club copies `data.club` to a place it can list cheaply. Both calls return untrusted data, the app validates it.

## Example

[examples/memory.js](examples/memory.js) is a tiny in-memory backend without a club. It forgets everything on reload, so it is a template, not a real server.

- `authMethods()` offers only the password form. `signIn` accepts the fixed demo user `demo@example.com` with the password `demo` and throws `Wrong identity or password.` otherwise.
- `push` keeps one row per `type:id`. A change replaces the row only when its `updatedAt` is higher, and every accepted change gets the next number of a counter.
- `pull(cursor)` reads the cursor as that number, returns the rows after it in counter order, 100 at most, and sets `more` while there are further rows. The new cursor is the number of the last row.

The test `src/lib/plugins/examples.test.ts` checks that it validates and does a sign in, a push and a pull round trip.

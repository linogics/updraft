# `backend` plugin: API reference

Generated from `api.d.ts`, do not edit.

A sync backend, apiVersion 1: headless, the app picks one and syncs through the adapter it creates.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. |
| `kind` | `'backend'` | Must be `'backend'`. |
| `apiVersion` | `1` | Must be `1`. |
| `create` | `(config: { url: string }): BackendAdapter` | Builds the adapter for the server at `config.url`. |
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

### AuthMethod

How a user can sign in to a backend. The adapter reports what its server offers.

```ts
type AuthMethod =
  /** The app shows a generic identity and password form. */
  | { kind: 'password' }
  /** OAuth or SSO. The adapter runs the popup or redirect itself. */
  | { kind: 'redirect'; id: string; label: string }
  /** One time code in two steps. Reserved, no adapter implements it yet. */
  | { kind: 'code'; label: string };
```

### BackendSession

| Field | Type | Description |
| --- | --- | --- |
| `user` | `string` | Display name or email. |

### ClubEntry

One shared flight in the club list. `stats` comes from the server and must be validated before use.

| Field | Type | Description |
| --- | --- | --- |
| `key` | `string` | Server row id, pass it to `club.flight`. |
| `owner` | `string` | Opaque account id. All flights of one pilot share it. |
| `mine` | `boolean` | Whether the flight belongs to the signed in account. |
| `stats` | `unknown` | The club summary of the flight record. Untrusted. |

### ClubAccess

Optional: lists flights that pilots shared with everyone on the server.

| Field | Type | Description |
| --- | --- | --- |
| `list` | `(): Promise<ClubEntry[]>` | Every shared flight of every pilot, without the tracks. |
| `flight` | `(key: string): Promise<unknown>` | The full record of one shared flight. Untrusted, validate it. |

### BackendAdapter

A transport that also owns login. The adapter keeps its own token, the app never sees one.

| Field | Type | Description |
| --- | --- | --- |
| `authMethods` | `(): Promise<AuthMethod[]>` | What the server offers for signing in. |
| `signIn` | `(method: AuthMethod, input?: Record<string, string>): Promise<BackendSession>` | A `redirect` method opens a popup, so call this from a user gesture. |
| `signOut` | `(): Promise<void>` | Ends the session and forgets the token. |
| `session` | `(): BackendSession \| null` | The stored session, survives a reload. |
| `club?` | `ClubAccess` | Shared flights of all pilots. Leave it out when the backend has no club. |

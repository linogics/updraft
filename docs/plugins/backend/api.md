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
| `provides?` | `Record<string, ServiceProvision>` | Services this plugin offers, by name `vendor/service@major`, each part matching `[a-z0-9-]{1,40}`. Each comes with its `schema`. The first provider of a name wins, a second one is refused. The vendor `updraft` is reserved. Removing the plugin removes its services. |
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

### JsonSchema

The JSON Schema subset that describes values in a service schema. Numbers must be finite.
`$ref` only points into `$defs` of the same service schema, as `#/$defs/Name`.

| Field | Type | Description |
| --- | --- | --- |
| `type?` | `'string' \| 'number' \| 'integer' \| 'boolean' \| 'null' \| 'object' \| 'array'` | The JSON type. `number` rejects `NaN` and infinities, `integer` is a whole number. |
| `enum?` | `(string \| number \| boolean \| null)[]` | The value must be one of these. |
| `const?` | `unknown` | The value must equal this. |
| `properties?` | `Record<string, JsonSchema>` | Schemas of the named fields of an object. Extra fields are allowed. |
| `required?` | `string[]` | Names of the fields that must be present, which means not `undefined`. |
| `additionalProperties?` | `boolean \| JsonSchema` | `false` forbids extra fields, a schema checks every field that is not in `properties`. |
| `items?` | `JsonSchema` | Schema of every item of an array. |
| `anyOf?` | `JsonSchema[]` | The value must match at least one of these. |
| `$ref?` | `string` | Reference to a shared schema, `#/$defs/Name`. |
| `minimum?` | `number` | Lower bound of a number, inclusive. |
| `maximum?` | `number` | Upper bound of a number, inclusive. |
| `description?` | `string` | Human readable text, shown in the API explorer. |
| `'x-kind'?` | `'function' \| 'opaque' \| 'void' \| 'promise'` | `function` is a callback or a function value, `opaque` is a host object that cannot be described and is not checked, for example the Cesium viewer, `void` is the absence of a value, `promise` is a promise whose value matches `resolves`. |
| `resolves?` | `JsonSchema` | With `x-kind: promise`, the schema of the value the promise resolves to. A rejection is not checked. |

### ServiceMethodSchema

One method of a service.

| Field | Type | Description |
| --- | --- | --- |
| `description` | `string` | What the method does. Shown in the API explorer. |
| `access` | `'read' \| 'write'` | `read` returns data and changes nothing, `write` changes state. Generated from the `@write` TSDoc tag. |
| `params` | `{ name: string; optional?: boolean; schema: JsonSchema }[]` | The parameters in call order. |
| `returns` | `JsonSchema` | The result. A method without a result returns `{ "x-kind": "void" }`. |

### ServiceSchema

The machine readable description of one service: methods with parameters, results and whether they write,
and events. Plugins ship it next to the factory. Generate it from your own `.d.ts` with `scripts/gen-plugin-docs.mjs`.
Calls across an installed plugin are checked against it, a call or result that does not match throws.

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | The service name, the same as the key in `provides`. |
| `description` | `string` | What the service is for. Shown in the API explorer. |
| `methods` | `Record<string, ServiceMethodSchema>` | The methods by name. A function `on(event, fn)` is not listed, declare `events` instead. |
| `events?` | `Record<string, { description: string }>` | The events `on` accepts, by name. Leave it out for a service without `on`. |
| `$defs?` | `Record<string, JsonSchema>` | Shared schemas that `$ref` points to. |

### ServiceProvision

What a plugin offers under one service name.

| Field | Type | Description |
| --- | --- | --- |
| `schema` | `ServiceSchema` | Describes the service, see `ServiceSchema`. |
| `create` | `ServiceFactory` | Builds the service on its first use. |

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
| `signUp?` | `?(input: { email: string; password: string }): Promise<BackendSession>` | Creates an account and signs in, same result as `signIn`. Leave it out when the server does not allow signup. |
| `signOut` | `(): Promise<void>` | Ends the session and forgets the token. |
| `session` | `(): BackendSession \| null` | The stored session, survives a reload. |
| `club?` | `ClubAccess` | Shared flights of all pilots. Leave it out when the backend has no club. |

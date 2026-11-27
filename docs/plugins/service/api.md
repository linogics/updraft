# `service` plugin: API reference

Generated from `api.d.ts`, do not edit.

A headless plugin, apiVersion 1: no panel, it only provides services.

## Members

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. |
| `name` | `string` | Not blank. |
| `kind` | `'service'` | Must be `'service'`. |
| `apiVersion` | `1` | Must be `1`. |
| `provides` | `Record<string, ServiceProvision>` | Must not be empty. |
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

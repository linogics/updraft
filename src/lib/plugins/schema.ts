import type { JsonSchema, ServiceSchema } from './api';

type Defs = Record<string, JsonSchema> | undefined;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks `value` against the JSON Schema subset of `api.d.ts`. Returns null when it fits, else a message that
 * starts with the path of the first mismatch, for example `flights()[0].fixes[3].lat: expected number`.
 * A field that is `undefined` counts as absent.
 */
export function validate(schema: JsonSchema, value: unknown, defs: Defs, path: string): string | null {
  if (schema.$ref !== undefined) {
    const target = schema.$ref.startsWith('#/$defs/') ? defs?.[schema.$ref.slice(8)] : undefined;
    return target ? validate(target, value, defs, path) : `${path}: unknown reference ${schema.$ref}`;
  }

  const kind = schema['x-kind'];
  if (kind === 'opaque') return null;
  if (kind === 'function') return typeof value === 'function' ? null : `${path}: expected function`;
  if (kind === 'void') return value === undefined ? null : `${path}: expected no value`;
  if (kind === 'promise') return value instanceof Promise ? null : `${path}: expected promise`;

  if (schema.anyOf) {
    return schema.anyOf.some((s) => validate(s, value, defs, path) === null)
      ? null
      : `${path}: matches none of the allowed types`;
  }

  if ('const' in schema && value !== schema.const) return `${path}: expected ${JSON.stringify(schema.const)}`;

  if (schema.enum && !schema.enum.includes(value as never)) {
    return `${path}: expected one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`;
  }

  switch (schema.type) {
    case 'string':
      return typeof value === 'string' ? null : `${path}: expected string`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path}: expected boolean`;
    case 'null':
      return value === null ? null : `${path}: expected null`;
    case 'number':
    case 'integer':
      return validateNumber(schema, value, path);
    case 'array':
      return validateArray(schema, value, defs, path);
    case 'object':
      return validateObject(schema, value, defs, path);
    default:
      return null;
  }
}

function validateNumber(schema: JsonSchema, value: unknown, path: string) {
  const integer = schema.type === 'integer';
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    return `${path}: expected ${integer ? 'integer' : 'number'}`;
  }

  if (schema.minimum !== undefined && value < schema.minimum) return `${path}: must be at least ${schema.minimum}`;
  if (schema.maximum !== undefined && value > schema.maximum) return `${path}: must be at most ${schema.maximum}`;
  return null;
}

function validateArray(schema: JsonSchema, value: unknown, defs: Defs, path: string) {
  if (!Array.isArray(value)) return `${path}: expected array`;
  const items = schema.items;
  if (!items) return null;

  for (let i = 0; i < value.length; i++) {
    const err = validate(items, value[i], defs, `${path}[${i}]`);
    if (err) return err;
  }

  return null;
}

function validateObject(schema: JsonSchema, value: unknown, defs: Defs, path: string) {
  if (!isObject(value)) return `${path}: expected object`;
  const props = schema.properties ?? {};

  for (const key of schema.required ?? []) {
    if (value[key] === undefined && props[key]) {
      const err = validate(props[key], undefined, defs, `${path}.${key}`);
      if (err) return err;
    } else if (value[key] === undefined) {
      return `${path}.${key}: is required`;
    }
  }

  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;

    if (props[key]) {
      const err = validate(props[key], v, defs, `${path}.${key}`);
      if (err) return err;
    } else if (schema.additionalProperties === false) {
      return `${path}.${key}: unexpected field`;
    } else if (typeof schema.additionalProperties === 'object') {
      const err = validate(schema.additionalProperties, v, defs, `${path}.${key}`);
      if (err) return err;
    }
  }

  return null;
}

/**
 * Wraps a service so that every call is checked against its schema. Parameters are checked before the call and
 * the result after it (the resolved value for a promise), a mismatch throws `Error('<service>.<method>: <message>')`. Only declared methods and
 * `on` are exposed. `on` accepts the declared events only. A result object that was checked once is not checked
 * again, so a service that returns the same frozen object stays cheap.
 */
export function checkService<T extends object>(schema: ServiceSchema, service: T): T {
  const target = service as Record<string, (...args: unknown[]) => unknown>;
  const { name, $defs: defs } = schema;
  const out: Record<string, unknown> = {};

  const fail = (method: string, message: string | null) => {
    if (message) throw new Error(`${name}.${method}: ${message}`);
  };

  for (const [method, def] of Object.entries(schema.methods)) {
    // Weak, so a cached result never keeps the data alive.
    const seen = new WeakSet<object>();

    out[method] = (...args: unknown[]) => {
      if (typeof target[method] !== 'function') fail(method, 'not implemented by the provider');
      def.params.forEach((p, i) => {
        if (args[i] === undefined && p.optional) return;
        fail(method, validate(p.schema, args[i], defs, p.name));
      });

      const result = target[method](...args);
      const { resolves } = def.returns;
      if (def.returns['x-kind'] === 'promise' && resolves) {
        fail(method, validate(def.returns, result, defs, `${method}()`));
        // A rejection passes through unchanged.
        return (result as Promise<unknown>).then((v) => {
          fail(method, validate(resolves, v, defs, `${method}()`));
          return v;
        });
      }

      const cacheable = typeof result === 'object' && result !== null;
      if (cacheable && seen.has(result)) return result;

      fail(method, validate(def.returns, result, defs, `${method}()`));
      if (cacheable) seen.add(result);
      return result;
    };
  }

  if (schema.events) {
    const events = schema.events;

    out.on = (event: unknown, fn: unknown) => {
      if (typeof event !== 'string' || !Object.hasOwn(events, event)) {
        throw new Error(`Unknown event "${String(event)}" of ${name}.`);
      }

      return target.on(event, fn);
    };
  }

  return Object.freeze(out) as T;
}

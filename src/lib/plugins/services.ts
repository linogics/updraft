import type { PluginBase, ServiceContext, ServiceFactory, ServiceSchema } from './api';
import { checkService } from './schema';

export type { PluginBase, ServiceContext, ServiceFactory, ServiceSchema };

/** `vendor/service@major`, for example `updraft/studio@1`. */
export const SERVICE_NAME = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}@[1-9][0-9]{0,3}$/;

/** Only bundled code may provide names in this namespace. */
export const RESERVED_NAMESPACE = 'updraft/';

/** Bundled code is the app itself and the plugins with an id under the reserved vendor. */
const isInstalled = (owner: string) => owner !== 'updraft' && !owner.startsWith(RESERVED_NAMESPACE);

/** The error for a write call that an installed plugin may not make. */
export const deniedMessage = (pluginId: string, service: string) =>
  `${pluginId} may not change ${service}. Allow it in the plugin settings.`;

/** Development and tests check every call, so a service that drifts from its schema fails early. */
const CHECK_ALWAYS = import.meta.env.DEV || import.meta.env.MODE === 'test';

/**
 * App wide registry of lazy services. A service is a plain object that is built on first use and shared by every
 * caller, so a call costs a function call and no copy. Callers must treat what it returns as read only.
 * Plain class, nothing renders from it. A service that needs reactivity reads reactive state inside its methods.
 */
export class ServiceRegistry {
  private factories = new Map<string, { factory: ServiceFactory; owner: string; schema?: ServiceSchema }>();
  private instances = new Map<string, object>();
  private building: string[] = [];
  // Checked wrappers are keyed by the instance, a rebuilt service gets a new one.
  private checked = new WeakMap<object, object>();
  // Guarded wrappers per instance and caller, they read the grants on every call.
  private guarded = new WeakMap<object, Map<string, object>>();
  private grantsOf: (pluginId: string) => readonly string[] = () => [];

  /** Where the registry asks which services an installed plugin may change. Nothing is granted until this is set. */
  setGrants(fn: (pluginId: string) => readonly string[]) {
    this.grantsOf = fn;
  }

  /**
   * Registers a lazy factory. The first provider of a name wins, a second one throws. Returns the unregister function.
   * A service with a `schema` can be checked on use, one without (internal state) never is.
   */
  provide(name: string, factory: ServiceFactory, owner: string, schema?: ServiceSchema): () => void {
    const taken = this.factories.get(name);
    if (taken) throw new Error(`Service "${name}" is already provided by "${taken.owner}".`);
    const entry = { factory, owner, schema };
    this.factories.set(name, entry);
    return () => {
      // A newer provider of the same name must stay.
      if (this.factories.get(name) !== entry) return;
      this.factories.delete(name);
      this.dropInstances();
    };
  }

  /** Drops everything `owner` provides, including built instances. */
  unregisterOwner(owner: string) {
    for (const [name, e] of [...this.factories]) if (e.owner === owner) this.factories.delete(name);
    this.dropInstances();
  }

  // A built service may hold another one it used, so every instance is dropped and rebuilt lazily on next use.
  // shortcut: drops more than needed, track dependents if rebuilds ever get costly.
  private dropInstances() {
    this.instances.clear();
  }

  has(name: string) {
    return this.factories.has(name);
  }

  ownerOf(name: string) {
    return this.factories.get(name)?.owner;
  }

  schemaOf(name: string) {
    return this.factories.get(name)?.schema;
  }

  /** Every registered service with its provider and schema. */
  list() {
    return [...this.factories].map(([name, e]) => ({ name, owner: e.owner, schema: e.schema }));
  }

  /** The names in `requires` that nobody provides. */
  missing(requires: readonly string[] = []) {
    return requires.filter((n) => !this.factories.has(n));
  }

  /**
   * The service, checked against its schema when `caller` is an installed plugin, when an installed plugin provides
   * it, or always in development and tests. `caller` is the id of the plugin that asks, absent for the app.
   */
  use<T = unknown>(name: string, caller?: string): T {
    const entry = this.factories.get(name);
    if (!entry) throw new Error(`Missing service "${name}". Add a plugin that provides it.`);
    const raw = this.build(name, entry);
    if (!entry.schema) return raw as T;
    if (!CHECK_ALWAYS && !isInstalled(entry.owner) && !(caller !== undefined && isInstalled(caller))) return raw as T;

    let wrapped = this.checked.get(raw);
    if (!wrapped) {
      wrapped = checkService(entry.schema, raw);
      this.checked.set(raw, wrapped);
    }

    // Installed plugins need a grant to change a service they do not provide. Bundled callers are exempt.
    if (caller === undefined || !isInstalled(caller) || entry.owner === caller) return wrapped as T;
    let byCaller = this.guarded.get(raw);
    if (!byCaller) {
      byCaller = new Map<string, object>();
      this.guarded.set(raw, byCaller);
    }

    let guard = byCaller.get(caller);
    if (!guard) {
      const out: Record<string, unknown> = { ...wrapped };
      for (const [method, def] of Object.entries(entry.schema.methods)) {
        if (def.access !== 'write') continue;

        out[method] = (...args: unknown[]) => {
          if (!this.grantsOf(caller).includes(name)) throw new Error(deniedMessage(caller, name));
          return (wrapped as Record<string, (...a: unknown[]) => unknown>)[method](...args);
        };
      }

      guard = Object.freeze(out);
      byCaller.set(caller, guard);
    }

    return guard as T;
  }

  private build(name: string, entry: { factory: ServiceFactory; owner: string }): object {
    const hit = this.instances.get(name);
    if (hit) return hit;

    if (this.building.includes(name)) {
      throw new Error(`Service cycle: ${[...this.building, name].map((n) => `"${n}"`).join(' -> ')}.`);
    }

    this.building.push(name);
    try {
      // A service sees other services as its provider does.
      const instance = entry.factory({ use: (n) => this.use(n, entry.owner) });
      this.instances.set(name, instance);
      return instance;
    } finally {
      this.building.pop();
    }
  }
}

export const services = new ServiceRegistry();

/** Checks `provides` and `requires` of a plugin module whose id, name and kind are already valid. */
export function validateServiceFields(p: Record<string, unknown>) {
  if (p.provides !== undefined) {
    if (!p.provides || typeof p.provides !== 'object' || Array.isArray(p.provides)) {
      throw new Error('"provides" must be an object of services, each with a schema and a create factory.');
    }

    for (const [name, provision] of Object.entries(p.provides)) {
      if (!SERVICE_NAME.test(name)) {
        throw new Error(`The service name "${name}" must look like "vendor/service@1", with a-z, 0-9 and "-".`);
      }

      const { schema, create } = (provision ?? {}) as { schema?: unknown; create?: unknown };
      if (typeof create !== 'function') throw new Error(`The factory "create" of "${name}" must be a function.`);
      validateSchemaShape(name, schema);
    }
  }

  if (p.requires !== undefined) {
    if (!Array.isArray(p.requires) || p.requires.some((n) => typeof n !== 'string' || !SERVICE_NAME.test(n))) {
      throw new Error('"requires" must be a list of service names like "vendor/service@1".');
    }
  }
}

/** Checks the outline of a service schema, the JSON Schema parts inside are checked when they are used. */
function validateSchemaShape(name: string, schema: unknown) {
  const s = schema as Partial<ServiceSchema> | undefined;
  if (!s || typeof s !== 'object') throw new Error(`The service "${name}" needs a "schema" object.`);
  if (s.name !== name) throw new Error(`The schema name "${String(s.name)}" must be "${name}".`);
  if (typeof s.description !== 'string') throw new Error(`The schema of "${name}" needs a "description" text.`);

  if (!s.methods || typeof s.methods !== 'object' || Array.isArray(s.methods)) {
    throw new Error(`The schema of "${name}" needs "methods", an object of methods.`);
  }

  if (s.events !== undefined && (!s.events || typeof s.events !== 'object' || Array.isArray(s.events))) {
    throw new Error(`The "events" of "${name}" must be an object.`);
  }

  for (const [method, def] of Object.entries(s.methods)) {
    const ok =
      def &&
      typeof def === 'object' &&
      (def.access === 'read' || def.access === 'write') &&
      Array.isArray(def.params) &&
      def.returns &&
      typeof def.returns === 'object';

    if (!ok) {
      throw new Error(`The method "${method}" of "${name}" needs "access" (read or write), "params" and "returns".`);
    }
  }
}

/** Plugins added by URL cannot take the reserved namespace, neither as id nor as service name. */
export function assertNotReserved(plugin: { id: string } & PluginBase) {
  if (plugin.id.startsWith(RESERVED_NAMESPACE)) {
    throw new Error(`The id "${plugin.id}" is reserved, "${RESERVED_NAMESPACE}" is for bundled plugins.`);
  }

  for (const name of Object.keys(plugin.provides ?? {})) {
    if (name.startsWith(RESERVED_NAMESPACE)) {
      throw new Error(`The service "${name}" is reserved, "${RESERVED_NAMESPACE}" is for bundled plugins.`);
    }
  }
}

/** Registers what a URL plugin provides. Safe to call again for a plugin that is already registered. */
export function registerProvides(plugin: { id: string } & PluginBase) {
  assertNotReserved(plugin);
  for (const [name, { create, schema }] of Object.entries(plugin.provides ?? {})) {
    if (services.ownerOf(name) !== plugin.id) services.provide(name, create, plugin.id, schema);
  }
}

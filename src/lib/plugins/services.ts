import type { PluginBase, ServiceContext, ServiceFactory } from './api';

export type { PluginBase, ServiceContext, ServiceFactory };

/** `vendor/service@major`, for example `updraft/studio@1`. */
export const SERVICE_NAME = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}@[1-9][0-9]{0,3}$/;

/** Only bundled code may provide names in this namespace. */
export const RESERVED_NAMESPACE = 'updraft/';

/**
 * App wide registry of lazy services. A service is a plain object that is built on first use and shared by every
 * caller, so a call costs a function call and no copy. Callers must treat what it returns as read only.
 * Plain class, nothing renders from it. A service that needs reactivity reads reactive state inside its methods.
 */
export class ServiceRegistry {
  private factories = new Map<string, { factory: ServiceFactory; owner: string }>();
  private instances = new Map<string, object>();
  private building: string[] = [];
  private ctx: ServiceContext = { use: (name) => this.use(name) };

  /** Registers a lazy factory. The first provider of a name wins, a second one throws. Returns the unregister function. */
  provide(name: string, factory: ServiceFactory, owner: string): () => void {
    const taken = this.factories.get(name);
    if (taken) throw new Error(`Service "${name}" is already provided by "${taken.owner}".`);
    const entry = { factory, owner };
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

  /** The names in `requires` that nobody provides. */
  missing(requires: readonly string[] = []) {
    return requires.filter((n) => !this.factories.has(n));
  }

  use<T = unknown>(name: string): T {
    const hit = this.instances.get(name);
    if (hit) return hit as T;
    const entry = this.factories.get(name);
    if (!entry) throw new Error(`Missing service "${name}". Add a plugin that provides it.`);
    if (this.building.includes(name))
      throw new Error(`Service cycle: ${[...this.building, name].map((n) => `"${n}"`).join(' -> ')}.`);

    this.building.push(name);
    try {
      const instance = entry.factory(this.ctx);
      this.instances.set(name, instance);
      return instance as T;
    } finally {
      this.building.pop();
    }
  }
}

export const services = new ServiceRegistry();

/** Checks `provides` and `requires` of a plugin module whose id, name and kind are already valid. */
export function validateServiceFields(p: Record<string, unknown>) {
  if (p.provides !== undefined) {
    if (!p.provides || typeof p.provides !== 'object' || Array.isArray(p.provides))
      throw new Error('"provides" must be an object of service factories.');

    for (const [name, factory] of Object.entries(p.provides)) {
      if (!SERVICE_NAME.test(name))
        throw new Error(`The service name "${name}" must look like "vendor/service@1", with a-z, 0-9 and "-".`);
      if (typeof factory !== 'function') throw new Error(`The factory of "${name}" must be a function.`);
    }
  }

  if (p.requires !== undefined) {
    if (!Array.isArray(p.requires) || p.requires.some((n) => typeof n !== 'string' || !SERVICE_NAME.test(n)))
      throw new Error('"requires" must be a list of service names like "vendor/service@1".');
  }
}

/** Plugins added by URL cannot take the reserved namespace, neither as id nor as service name. */
export function assertNotReserved(plugin: { id: string } & PluginBase) {
  if (plugin.id.startsWith(RESERVED_NAMESPACE))
    throw new Error(`The id "${plugin.id}" is reserved, "${RESERVED_NAMESPACE}" is for bundled plugins.`);
  for (const name of Object.keys(plugin.provides ?? {}))
    if (name.startsWith(RESERVED_NAMESPACE))
      throw new Error(`The service "${name}" is reserved, "${RESERVED_NAMESPACE}" is for bundled plugins.`);
}

/** Registers what a URL plugin provides. Safe to call again for a plugin that is already registered. */
export function registerProvides(plugin: { id: string } & PluginBase) {
  assertNotReserved(plugin);
  for (const [name, factory] of Object.entries(plugin.provides ?? {}))
    if (services.ownerOf(name) !== plugin.id) services.provide(name, factory, plugin.id);
}

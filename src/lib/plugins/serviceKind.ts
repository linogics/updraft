import type { PluginBase } from './services';

/** apiVersion of the service kind. */
export const SERVICE_API_VERSION = 1;

/** A headless plugin: no panel, it only provides services. */
export interface ServicePlugin extends PluginBase {
  id: string;
  name: string;
  kind: 'service';
  apiVersion: 1;
  provides: NonNullable<PluginBase['provides']>;
}

/** Checks the service specific fields. `provides` itself is already checked by the core. */
export function validateServicePlugin(p: Record<string, unknown>): ServicePlugin {
  if (p.apiVersion !== SERVICE_API_VERSION)
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, services support ${SERVICE_API_VERSION}.`);
  if (!p.provides || !Object.keys(p.provides).length)
    throw new Error('A service plugin must provide at least one service in "provides".');
  return p as unknown as ServicePlugin;
}

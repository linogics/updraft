import type { ServicePlugin } from './api';

export type { ServicePlugin };

/** apiVersion of the service kind. */
export const SERVICE_API_VERSION = 1;

/** Checks the service specific fields. `provides` itself is already checked by the core. */
export function validateServicePlugin(p: Record<string, unknown>): ServicePlugin {
  if (p.apiVersion !== SERVICE_API_VERSION) {
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, services support ${SERVICE_API_VERSION}.`);
  }

  if (!p.provides || !Object.keys(p.provides).length) {
    throw new Error('A service plugin must provide at least one service in "provides".');
  }

  return p as unknown as ServicePlugin;
}

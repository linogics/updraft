import type { BackendAdapter } from '#lib/sync/types';
import type { PluginBase } from './services';

/** apiVersion of the backend kind. */
export const BACKEND_API_VERSION = 1;

/** A sync backend: the app picks one and syncs through the adapter it creates. */
export interface BackendPlugin extends PluginBase {
  id: string;
  name: string;
  kind: 'backend';
  apiVersion: 1;
  create(config: { url: string }): BackendAdapter;
}

/** Checks the backend specific fields. */
export function validateBackendPlugin(p: Record<string, unknown>): BackendPlugin {
  if (p.apiVersion !== BACKEND_API_VERSION)
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, backends support ${BACKEND_API_VERSION}.`);
  if (typeof p.create !== 'function') throw new Error('"create" must be a function.');
  return p as unknown as BackendPlugin;
}

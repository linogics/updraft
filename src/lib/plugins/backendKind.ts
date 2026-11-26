import type { BackendPlugin } from './api';

export type { BackendPlugin };

/** apiVersion of the backend kind. */
export const BACKEND_API_VERSION = 1;

/** Checks the backend specific fields. */
export function validateBackendPlugin(p: Record<string, unknown>): BackendPlugin {
  if (p.apiVersion !== BACKEND_API_VERSION) {
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, backends support ${BACKEND_API_VERSION}.`);
  }

  if (typeof p.create !== 'function') throw new Error('"create" must be a function.');
  return p as unknown as BackendPlugin;
}

import type { ConverterPlugin, PluginTrack } from './api';

export type { ConverterPlugin, PluginTrack };

/** apiVersion of the converter kind. */
export const CONVERTER_API_VERSION = 1;

export const EXTENSION = /^[a-z0-9]{1,10}$/;

/** What the app keeps about a converter without importing it. */
export interface ConverterMeta {
  label: string;
  extensions: string[];
  canRead: boolean;
  canWrite: boolean;
  mime?: string;
}

const isExtensions = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((e) => typeof e === 'string' && EXTENSION.test(e)) &&
  new Set(v).size === v.length;

/** Checks the stored metadata of a converter entry. */
export const isConverterMeta = (o: Record<string, unknown>) =>
  typeof o.label === 'string' &&
  !!o.label.trim() &&
  isExtensions(o.extensions) &&
  typeof o.canRead === 'boolean' &&
  typeof o.canWrite === 'boolean' &&
  (o.canRead || o.canWrite) &&
  (o.mime === undefined || (typeof o.mime === 'string' && !!o.mime.trim()));

/** Checks the converter specific fields. */
export function validateConverterPlugin(p: Record<string, unknown>): ConverterPlugin {
  if (p.apiVersion !== CONVERTER_API_VERSION) {
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, converters support ${CONVERTER_API_VERSION}.`);
  }

  if (typeof p.label !== 'string' || !p.label.trim()) throw new Error('"label" must be a non-empty string.');

  if (!isExtensions(p.extensions)) {
    throw new Error(
      '"extensions" must be a list of unique lower case extensions, 1 to 10 characters from a-z and 0-9.'
    );
  }

  if (p.mime !== undefined && (typeof p.mime !== 'string' || !p.mime.trim())) {
    throw new Error('"mime" must be a non-empty string.');
  }

  for (const f of ['read', 'write']) {
    if (p[f] !== undefined && typeof p[f] !== 'function') throw new Error(`"${f}" must be a function.`);
  }

  if (!p.read && !p.write) throw new Error('A converter must have "read" or "write".');
  return p as unknown as ConverterPlugin;
}

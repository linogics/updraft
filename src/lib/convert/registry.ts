import type { Flight } from '#lib/domain/model';
import { m } from '#lib/paraglide/messages';
import { BUILTIN_CONVERTERS } from '#lib/plugins/builtin';
import type { ConverterMeta, ConverterPlugin } from '#lib/plugins/converterKind';
import { type AnyPlugin, loadPlugin, validatePlugin } from '#lib/plugins/core';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';

import { toFlightChecked } from './track';

/** A track format the app knows, loaded on first use. */
export interface Converter extends ConverterMeta {
  id: string;
  load: () => Promise<ConverterPlugin>;
}

const fromModule = (meta: ConverterMeta & { id: string }, plugin: AnyPlugin): ConverterPlugin => {
  const { id } = meta;
  if (plugin.kind !== 'converter' || plugin.id !== id) throw new Error(`"${id}" is not the expected converter plugin.`);
  const same =
    plugin.extensions.length === meta.extensions.length &&
    meta.extensions.every((e) => plugin.extensions.includes(e)) &&
    !!plugin.read === meta.canRead &&
    !!plugin.write === meta.canWrite;
  if (!same) throw new Error(`The converter "${id}" changed since it was added. Remove it and add it again.`);
  return plugin;
};

/** Bundled formats first, then installed ones in the order they were added. Reactive. */
export function converters(): Converter[] {
  const installed = pluginPrefs.list.filter((e) => e.kind === 'converter');
  return [
    ...BUILTIN_CONVERTERS.map((b) => ({
      ...b,
      load: async () => fromModule(b, validatePlugin((await b.load()).default))
    })),
    ...installed.map((e) => {
      const meta = {
        id: e.id,
        label: e.label!,
        extensions: e.extensions!,
        canRead: e.canRead!,
        canWrite: e.canWrite!,
        mime: e.mime
      };
      return { ...meta, load: async () => fromModule(meta, await loadPlugin(e.url)) };
    })
  ];
}

export const readers = () => converters().filter((c) => c.canRead);
export const writers = () => converters().filter((c) => c.canWrite);

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const readerOf = (name: string) => readers().find((c) => c.extensions.includes(extOf(name)));

/** Format label for a file name, or undefined when unsupported. */
export const formatOf = (name: string) => readerOf(name)?.label;

/** The converter that already handles one of `extensions`, for the add check. */
export const clashOf = (extensions: readonly string[]) =>
  converters()
    .map((c) => ({ c, ext: extensions.find((e) => c.extensions.includes(e)) }))
    .find((x) => x.ext);

export async function readTrack(file: File): Promise<Flight> {
  const c = readerOf(file.name);
  if (!c) throw new Error(m.format_unsupported({ name: file.name }));
  const plugin = await c.load();
  return toFlightChecked(await plugin.read!(file), file.name);
}

/** File content in the converter's format, always bytes. Throws when the plugin returns anything else. */
export async function writeTrack(c: Converter, flight: Flight): Promise<Uint8Array> {
  const { pilot, glider, site, date } = flight;
  // A copy, so a plugin cannot change the stored flight.
  const fixes = flight.fixes.map((f) => ({ t: f.t, lat: f.lat, lon: f.lon, alt: f.alt }));
  const out: unknown = (await c.load()).write!({ pilot, glider, site, date, fixes });
  if (typeof out === 'string') return new TextEncoder().encode(out);
  if (out instanceof Uint8Array) return out;
  throw new Error(`The ${c.label} converter must return a string or a Uint8Array.`);
}

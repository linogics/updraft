import { readers } from '#lib/convert/registry';

/** Track file extensions the importers read, as an `accept` list. Reactive. */
export const trackAccept = () =>
  readers()
    .flatMap((c) => c.extensions.map((e) => `.${e}`))
    .join(',');

/** The track files of a file list, other files are dropped. */
export const trackFiles = (list: FileList | null | undefined) => {
  const known = new Set(readers().flatMap((c) => c.extensions));
  return [...(list ?? [])].filter((f) => known.has(f.name.split('.').pop()?.toLowerCase() ?? ''));
};

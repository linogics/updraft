import type { Flight } from '#lib/domain/model';

import type { PluginTrack } from '../../converterKind';

// The writers only read the track fields, id and sourceName are placeholders.
export const asFlight = (t: PluginTrack): Flight => ({ id: '', sourceName: '', ...t, fixes: [...t.fixes] });

export const readText = (read: (text: string, name: string) => PluginTrack) => async (f: File) =>
  read(await f.text(), f.name);

import type { LeagueRule } from '#lib/plugins/api';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';

import { BUILTIN_LEAGUES } from './builtinLeagues';

/** A league the app can score with. Plugin ids are `<plugin id>:<league id>`. */
export interface League {
  id: string;
  label: string;
  rules: readonly LeagueRule[];
}

/** Used whenever the chosen league is unknown, for example after its plugin was removed. */
export const DEFAULT_LEAGUE = 'XContest';

let src: unknown;
let list: readonly Readonly<League>[] = [];

/** Bundled leagues, then those of installed plugins in the order they were added. Reactive, and the same array until the plugin list changes. */
export function leagues(): readonly Readonly<League>[] {
  if (src !== pluginPrefs.list) {
    src = pluginPrefs.list;
    list = Object.freeze([
      ...BUILTIN_LEAGUES,
      ...pluginPrefs.list.flatMap((e) => (e.leagues ?? []).map((l) => ({ ...l, id: `${e.id}:${l.id}` })))
    ]);
  }

  return list;
}

export const leagueOf = (id: unknown): Readonly<League> | undefined => leagues().find((l) => l.id === id);

/** Label for a league id, the id itself when the league is not known here. */
export const leagueLabel = (id: string): string => leagueOf(id)?.label ?? id;

/** FNV-1a, short and stable. Only keys a cache, so collisions are harmless. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Cache key part of a league. Bundled ids stay as they are, plugin ids change with their rules. */
export function leagueCacheId(id: string): string {
  const l = leagueOf(id);
  return l && id.includes(':') ? `${id}~${hash(JSON.stringify(l.rules))}` : id;
}

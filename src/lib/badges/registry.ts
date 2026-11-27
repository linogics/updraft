import type { BadgeDef } from '#lib/plugins/badgeKind';
import { BUILTIN_BADGES } from '#lib/plugins/builtin';
import { type AnyPlugin, loadPlugin, validatePlugin } from '#lib/plugins/core';
import type { PluginEntry } from '#lib/plugins/entries';
import { sortByName } from '#lib/ui/attention';

/** The badges of one plugin. */
export interface BadgeGroup {
  id: string;
  name: string;
  builtin: boolean;
  badges: BadgeDef[];
}

export const BUILTIN_BADGE_PLUGIN = 'updraft/badges';

/** Bundled badges first, then the installed plugins A to Z. A plugin that fails to load is left out. */
export async function loadBadgeGroups(entries: readonly PluginEntry[]): Promise<BadgeGroup[]> {
  const one = async (id: string, name: string, builtin: boolean, load: () => Promise<AnyPlugin>) => {
    try {
      const plugin = await load();
      if (plugin.kind !== 'badge') throw new Error('Not a badge plugin.');
      return [{ id, name, builtin, badges: plugin.badges }];
    } catch (err) {
      console.error(`Badge plugin ${id} failed to load`, err);
      return [];
    }
  };

  const bundled = BUILTIN_BADGES.map((b) =>
    one(b.id, b.id, true, async () => validatePlugin((await b.load()).default))
  );
  const installed = sortByName(
    entries.filter((e) => e.kind === 'badge'),
    (e) => e.name
  ).map((e) => one(e.id, e.name, false, () => loadPlugin(e.url)));
  return (await Promise.all([...bundled, ...installed])).flat();
}

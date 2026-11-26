import { BUILTIN_XC_PLANNERS } from '#lib/plugins/builtin';
import { type AnyPlugin, loadPlugin, validatePlugin } from '#lib/plugins/core';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
import type { PlanRoute, XcPlannerPlugin } from '#lib/plugins/xcPlannerKind';

/** One export button of the planner. The plugin is only imported when `write` runs. */
export interface PlannerExport {
  /** Plugin id and index, unique in the list. */
  id: string;
  title: () => string;
  extension: string;
  mime: string;
  /** File content as bytes. Throws with a message for the user when the plugin fails. */
  write: (route: PlanRoute) => Promise<Uint8Array>;
}

/** `label` is missing for bundled exports, their titles are translated and only the extension is checked. */
type Meta = { label?: string; extension: string };

const fromModule = (id: string, metas: Meta[], plugin: AnyPlugin): XcPlannerPlugin => {
  if (plugin.kind !== 'xc-planner' || plugin.id !== id) {
    throw new Error(`"${id}" is not the expected xc-planner plugin.`);
  }

  const list = plugin.exports ?? [];
  const same =
    list.length === metas.length &&
    metas.every(
      (e, i) => list[i].extension === e.extension && (e.label === undefined || list[i].label.trim() === e.label)
    );
  if (!same) throw new Error(`The plugin "${id}" changed since it was added. Remove it and add it again.`);
  return plugin;
};

function build(
  id: string,
  metas: Meta[],
  i: number,
  mime: string | undefined,
  title: () => string,
  load: () => Promise<AnyPlugin>
): PlannerExport {
  return {
    id: `${id}#${i}`,
    title,
    extension: metas[i].extension,
    mime: mime ?? 'application/octet-stream',
    async write(route) {
      const e = fromModule(id, metas, await load()).exports![i];
      // A copy, so a plugin cannot change the planned route.
      const copy: PlanRoute = {
        points: route.points.map((p) => Object.freeze({ lat: p.lat, lon: p.lon })),
        speed: Number(route.speed)
      };
      const out: unknown = e.write(copy);
      if (typeof out === 'string') return new TextEncoder().encode(out);
      if (out instanceof Uint8Array) return out;
      throw new Error(`The ${e.label} export must return a string or a Uint8Array.`);
    }
  };
}

/** Bundled exports first, then installed ones in the order they were added. Reactive. */
export function planExports(): PlannerExport[] {
  return [
    ...BUILTIN_XC_PLANNERS.flatMap((b) =>
      b.exports.map((e, i) =>
        build(
          b.id,
          b.exports.map(({ extension }) => ({ extension })),
          i,
          e.mime,
          e.label,
          async () => validatePlugin((await b.load()).default)
        )
      )
    ),
    ...pluginPrefs.list
      .filter((e) => e.kind === 'xc-planner')
      .flatMap((e) =>
        e.exports!.map((x, i) =>
          build(
            e.id,
            e.exports!,
            i,
            x.mime,
            () => x.label,
            () => loadPlugin(e.url)
          )
        )
      )
  ];
}

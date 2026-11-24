import type { Dock } from '#lib/studio/panels';

export interface StudioLayoutValue {
  /** Panel ids per dock, in display order. */
  docks: Record<Dock, string[]>;
  /** Panels the user switched off. */
  hidden: string[];
  /** Left and right dock width, bottom dock height (px), share of the 3D view in split layout (0..1). */
  sizes: { left: number; right: number; bottom: number; split: number };
  open: Record<Dock, boolean>;
  /** Active panel in the bottom dock, null for the first one. */
  tab: string | null;
}

export const LAYOUT_LIMITS = {
  left: { min: 200, max: 480, initial: 280 },
  right: { min: 220, max: 640, initial: 300 },
  bottom: { min: 80, max: 480, initial: 200 },
  split: { min: 0.2, max: 0.8, initial: 0.5 }
} as const;

export type LayoutSize = keyof typeof LAYOUT_LIMITS;

export function clampSize(key: LayoutSize, v: number): number {
  const { min, max } = LAYOUT_LIMITS[key];
  return Math.min(max, Math.max(min, v));
}

/**
 * Validates stored layout field by field. `defaults` maps every known panel id to its default dock.
 * Unknown and duplicate ids are dropped, known ids that are missing go to their default dock.
 * Bad sizes fall back to the initial size, then get clamped.
 */
export function parseStudioLayout(raw: unknown, defaults: Record<string, Dock>): StudioLayoutValue {
  const obj = (x: unknown) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const o = obj(raw);
  const known = Object.keys(defaults);
  const seen = new Set<string>();
  const take = (list: unknown): string[] => {
    const out: string[] = [];
    if (Array.isArray(list))
      for (const id of list)
        if (typeof id === 'string' && known.includes(id) && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
    return out;
  };
  const stored = obj(o.docks);
  const docks: Record<Dock, string[]> = {
    left: take(stored.left),
    right: take(stored.right),
    bottom: take(stored.bottom)
  };
  const hidden = take(o.hidden);
  for (const id of known) if (!seen.has(id)) docks[defaults[id]].push(id);

  const sizes = obj(o.sizes);
  const size = (key: LayoutSize) =>
    clampSize(
      key,
      typeof sizes[key] === 'number' && Number.isFinite(sizes[key])
        ? (sizes[key] as number)
        : LAYOUT_LIMITS[key].initial
    );
  const open = obj(o.open);
  const isOpen = (d: Dock) => (typeof open[d] === 'boolean' ? (open[d] as boolean) : true);
  return {
    docks,
    hidden,
    sizes: { left: size('left'), right: size('right'), bottom: size('bottom'), split: size('split') },
    open: { left: isOpen('left'), right: isOpen('right'), bottom: isOpen('bottom') },
    tab: typeof o.tab === 'string' && docks.bottom.includes(o.tab) ? o.tab : null
  };
}

/** Puts a panel at `index` of a dock (clamped, so Infinity means the end) and opens that dock. */
export function moveInLayout(v: StudioLayoutValue, id: string, dock: Dock, index: number): StudioLayoutValue {
  const without = (list: string[]) => list.filter((x) => x !== id);
  const docks = { left: without(v.docks.left), right: without(v.docks.right), bottom: without(v.docks.bottom) };
  docks[dock].splice(Math.max(0, Math.min(index, docks[dock].length)), 0, id);
  return {
    ...v,
    docks,
    hidden: without(v.hidden),
    open: { ...v.open, [dock]: true },
    tab: dock === 'bottom' ? id : v.tab
  };
}

export function hideInLayout(v: StudioLayoutValue, id: string): StudioLayoutValue {
  const without = (list: string[]) => list.filter((x) => x !== id);
  return {
    ...v,
    docks: { left: without(v.docks.left), right: without(v.docks.right), bottom: without(v.docks.bottom) },
    hidden: [...without(v.hidden), id]
  };
}

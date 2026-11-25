export interface PageLayoutValue {
  /** Panel ids per column, in display order. */
  columns: Record<string, string[]>;
  /** Panels folded to their header. */
  collapsed: string[];
}

/**
 * Validates stored layout field by field. `defaults` maps every column to its default panel ids.
 * Unknown and duplicate ids are dropped, known ids that are missing go to the end of their default column.
 * Without a stored `collapsed` list, `collapsed` (the ids that start folded) is used.
 */
export function parsePageLayout(
  raw: unknown,
  defaults: Record<string, string[]>,
  collapsed: readonly string[]
): PageLayoutValue {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const stored = (o.columns && typeof o.columns === 'object' ? o.columns : {}) as Record<string, unknown>;
  const known = Object.values(defaults).flat();
  const seen = new Set<string>();
  const columns: Record<string, string[]> = {};
  for (const col of Object.keys(defaults)) {
    columns[col] = [];
    const list = stored[col];
    if (!Array.isArray(list)) continue;

    for (const id of list)
      if (typeof id === 'string' && known.includes(id) && !seen.has(id)) {
        seen.add(id);
        columns[col].push(id);
      }
  }

  for (const [col, ids] of Object.entries(defaults)) for (const id of ids) if (!seen.has(id)) columns[col].push(id);

  return {
    columns,
    collapsed: Array.isArray(o.collapsed)
      ? [...new Set(o.collapsed.filter((id): id is string => typeof id === 'string' && known.includes(id)))]
      : collapsed.filter((id) => known.includes(id))
  };
}

/** Puts a panel at `index` of a column (clamped, so Infinity means the end). */
export function movePanelIn(v: PageLayoutValue, id: string, column: string, index: number): PageLayoutValue {
  const columns = Object.fromEntries(Object.entries(v.columns).map(([c, ids]) => [c, ids.filter((x) => x !== id)]));
  const target = columns[column];
  if (!target) return v;

  target.splice(Math.max(0, Math.min(index, target.length)), 0, id);
  return { ...v, columns };
}

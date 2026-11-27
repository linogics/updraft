export interface Versioned {
  data: Record<string, unknown>;
  times: Record<string, number>;
}

/**
 * Per field last write wins. A field without a time counts as oldest, a tie keeps the remote value,
 * so two devices that merge the same pair end with the same item.
 */
export function mergeItems(local: Versioned, remote: Versioned): Versioned {
  const data: Record<string, unknown> = {};
  const times: Record<string, number> = {};
  const fields = new Set([...Object.keys(local.data), ...Object.keys(remote.data)]);
  for (const f of fields) {
    const lt = local.times[f] ?? -Infinity;
    const rt = remote.times[f] ?? -Infinity;
    // Without any time the side that has the field keeps it.
    const takeLocal = lt > rt || (lt === rt && lt === -Infinity && !(f in remote.data));
    const source = takeLocal ? local : remote;
    if (f in source.data) data[f] = source.data[f];
    const t = Math.max(lt, rt);
    if (Number.isFinite(t)) times[f] = t;
  }

  return { data, times };
}

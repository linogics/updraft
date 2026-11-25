const listeners = new Set<() => void>();

/** Called after a local write that the sync engine still has to push. Returns the unsubscribe function. */
export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function notifyLocalChange() {
  for (const fn of listeners) fn();
}

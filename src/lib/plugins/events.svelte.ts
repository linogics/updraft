/**
 * Calls `fn` after the reactive values read by `read` changed, at most once per animation frame.
 * Not called for the state at the time of subscribing. Returns a function that stops it.
 */
export function onChange(read: () => void, fn: () => void): () => void {
  let frame = 0;
  let first = true;
  const stopRoot = $effect.root(() => {
    $effect(() => {
      // Reading these is what makes the effect run again.
      read();
      if (first) {
        first = false;
        return;
      }

      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fn();
      });
    });
  });

  return () => {
    stopRoot();
    if (frame) cancelAnimationFrame(frame);
  };
}

/** Builds the `on(event, fn)` of a service from a map of event name to the reads it tracks. */
export function eventsOf<E extends string>(service: string, reads: Record<E, () => void>) {
  return (event: E, fn: () => void) => {
    if (!Object.hasOwn(reads, event)) throw new Error(`Unknown event "${String(event)}" of ${service}.`);
    return onChange(reads[event], fn);
  };
}

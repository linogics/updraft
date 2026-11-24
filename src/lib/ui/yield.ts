/** Gives the main thread back to the browser so input and rendering are not blocked by long loops. */
export function yieldToMain(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in scheduler) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

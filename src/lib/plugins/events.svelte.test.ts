import { describe, expect, it } from 'vitest';

import { eventsOf } from './events.svelte';

// Effects are inert under vitest (server build of Svelte), the reactive part is covered by the e2e plugin tests.
describe('eventsOf', () => {
  it('throws on an unknown event', () => {
    const on = eventsOf('t/x@1', { a: () => {} });
    expect(() => on('b' as 'a', () => {})).toThrow('Unknown event "b" of t/x@1.');
    on('a', () => {})();
  });
});

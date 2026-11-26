import { describe, expect, it } from 'vitest';

import { eventsOf } from './events.svelte';

// Effects are inert in this project (server build of Svelte), `onChange` is tested in events.client.svelte.test.ts.
describe('eventsOf', () => {
  it('throws on an unknown event', () => {
    const on = eventsOf('t/x@1', { a: () => {} });
    expect(() => on('b' as 'a', () => {})).toThrow('Unknown event "b" of t/x@1.');
    on('a', () => {})();
  });
});

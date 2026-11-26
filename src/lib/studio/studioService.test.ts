import { afterEach, describe, expect, it } from 'vitest';

import { services } from '#lib/plugins/services';

import { provideStudioService, STUDIO_SERVICE, type StudioService } from './studioService.svelte';

const lf = (id: string, color: string) => ({
  flight: { id, pilot: id, glider: null, fixes: [] },
  color,
  visible: true
});

describe('updraft/studio@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('returns the same frozen flights until they change', () => {
    const studio = { flights: [lf('a', '#111')], time: 0, selected: undefined, selectedId: null };
    provideStudioService(studio as never);
    const s = services.use<StudioService>(STUDIO_SERVICE);

    const first = s.flights();
    expect(s.flights()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(s.units()).toBe(s.units());

    studio.flights = [lf('a', '#222')];
    expect(s.flights()).not.toBe(first);
    expect(s.flights()[0].color).toBe('#222');
  });

  it('has events and refuses unknown ones', () => {
    provideStudioService({ flights: [], time: 0, selected: undefined } as never);
    const s = services.use<StudioService>(STUDIO_SERVICE);
    for (const e of ['time', 'flights', 'selection', 'units', 'altRef'] as const) s.on(e, () => {})();
    expect(() => s.on('x' as 'time', () => {})).toThrow('Unknown event "x" of updraft/studio@1.');
  });
});

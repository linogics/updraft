import { afterEach, describe, expect, it } from 'vitest';

import { services } from '#lib/plugins/services';

import { ANALYSIS_SERVICE, type AnalysisService, provideAnalysisService } from './analysisService.svelte';

describe('updraft/flight-analysis@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('looks up stats and transitions by id and returns null for unknown ids', () => {
    const stats = { duration: 1 };
    const studio = {
      flights: [{ flight: { id: 'a' }, analysis: { stats } }],
      transitionSummary: (_lf: unknown, agl: boolean) => ({ count: agl ? 2 : 1 })
    };
    provideAnalysisService(studio as never);
    const s = services.use<AnalysisService>(ANALYSIS_SERVICE);

    expect(s.stats('a')).toBe(stats);
    expect(s.stats('x')).toBeNull();
    expect(s.transitions('a', 'msl')).toEqual({ count: 1 });
    expect(s.transitions('a', 'agl')).toEqual({ count: 2 });
    expect(s.transitions('x', 'msl')).toBeNull();
  });

  it('has the changed event and refuses unknown ones', () => {
    provideAnalysisService({ flights: [] } as never);
    const s = services.use<AnalysisService>(ANALYSIS_SERVICE);
    s.on('changed', () => {})();
    expect(() => s.on('x' as 'changed', () => {})).toThrow('Unknown event "x" of updraft/flight-analysis@1.');
  });
});

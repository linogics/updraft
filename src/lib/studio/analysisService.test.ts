import { afterEach, describe, expect, it } from 'vitest';

import { services } from '#lib/plugins/services';

import { ANALYSIS_SERVICE, type AnalysisService, provideAnalysisService } from './analysisService.svelte';

describe('updraft/flight-analysis@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('looks up stats and transitions by id and returns null for unknown ids', () => {
    const stats = {
      duration: 1,
      trackLength: 1,
      straightDistance: 1,
      maxDistanceFromTakeoff: 1,
      maxAlt: 1,
      minAlt: 1,
      takeoffAlt: 1,
      landingAlt: 1,
      maxClimb: 1,
      maxSink: -1,
      phaseShare: { thermalling: 0.3, gliding: 0.5, searching: 0.2 },
      glideRatio: null
    };
    const summary = (count: number) => ({
      count,
      avgStartAlt: null,
      avgEndAlt: null,
      lowestArrival: null,
      avgGlideRatio: null,
      avgSpeed: null
    });
    const studio = {
      flights: [{ flight: { id: 'a' }, analysis: { stats } }],
      transitionSummary: (_lf: unknown, agl: boolean) => summary(agl ? 2 : 1)
    };
    provideAnalysisService(studio as never);
    const s = services.use<AnalysisService>(ANALYSIS_SERVICE);

    expect(s.stats('a')).toBe(stats);
    expect(s.stats('x')).toBeNull();
    expect(s.transitions('a', 'msl')).toEqual(summary(1));
    expect(s.transitions('a', 'agl')).toEqual(summary(2));
    expect(s.transitions('x', 'msl')).toBeNull();
  });

  it('has the changed event and refuses unknown ones', () => {
    provideAnalysisService({ flights: [] } as never);
    const s = services.use<AnalysisService>(ANALYSIS_SERVICE);
    s.on('changed', () => {})();
    expect(() => s.on('x' as 'changed', () => {})).toThrow('Unknown event "x" of updraft/flight-analysis@1.');
  });
});

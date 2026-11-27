import { afterEach, describe, expect, it, vi } from 'vitest';

import { provideFlightsService } from '#lib/data/flights';
import { providePrefsService } from '#lib/data/prefs';
import { provideSyncService } from '#lib/data/sync';
import { providePlanService } from '#lib/plan/planService.svelte';
import { PlanState } from '#lib/state/plan.svelte';
import { provideAnalysisService } from '#lib/studio/analysisService.svelte';
import { provideStudioService } from '#lib/studio/studioService.svelte';

import type { ServiceSchema } from './api';
import { analysisSchema, flightsSchema, planSchema, prefsSchema, studioSchema, syncSchema } from './coreSchemas';
import { services } from './services';

// The real repository opens IndexedDB when it is imported.
vi.mock('#lib/storage', () => ({ flightRepository: {} }));

/** The unchecked service object, as the factory builds it. */
function rawService(provide: () => unknown) {
  const spy = vi.spyOn(services, 'provide');
  provide();
  const factory = spy.mock.calls[0][1];
  return factory({ use: <T>() => ({}) as T }) as Record<string, unknown>;
}

describe('core schemas match the services', () => {
  afterEach(() => {
    services.unregisterOwner('updraft');
    vi.restoreAllMocks();
  });

  const cases: [ServiceSchema, () => Record<string, unknown>][] = [
    [studioSchema, () => rawService(() => provideStudioService({ flights: [] } as never))],
    [analysisSchema, () => rawService(() => provideAnalysisService({ flights: [] } as never))],
    [planSchema, () => rawService(() => providePlanService(new PlanState(), { commit: () => {} }))],
    [flightsSchema, () => rawService(() => provideFlightsService())],
    [prefsSchema, () => rawService(() => providePrefsService())],
    [syncSchema, () => rawService(() => provideSyncService())]
  ];

  it.each(cases.map((c) => [c[0].name, ...c] as const))('%s', (_, schema, build) => {
    const real = Object.keys(build()).sort();
    const declared = [...Object.keys(schema.methods), ...(schema.events ? ['on'] : [])].sort();
    expect(real).toEqual(declared);
  });
});

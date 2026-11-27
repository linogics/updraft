import type { ServiceSchema } from './api';
import analysis from './schemas/updraft-flight-analysis-1.json';
import flights from './schemas/updraft-flights-1.json';
import plan from './schemas/updraft-plan-1.json';
import prefs from './schemas/updraft-prefs-1.json';
import studio from './schemas/updraft-studio-1.json';
import sync from './schemas/updraft-sync-1.json';

// The JSON files are generated from `api.d.ts` by `npm run docs:api`, their literal types are wider than the schema types.
export const studioSchema = studio as unknown as ServiceSchema;
export const analysisSchema = analysis as unknown as ServiceSchema;
export const planSchema = plan as unknown as ServiceSchema;
export const flightsSchema = flights as unknown as ServiceSchema;
export const prefsSchema = prefs as unknown as ServiceSchema;
export const syncSchema = sync as unknown as ServiceSchema;

/** The schemas of the core services, available without the studio or the planner being open. */
export const coreSchemas: readonly ServiceSchema[] = [
  studioSchema,
  analysisSchema,
  planSchema,
  flightsSchema,
  prefsSchema,
  syncSchema
];

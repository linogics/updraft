import type { Fix } from '../domain/model';
import { leagueOf } from './leagues';
import type { XcScore } from './types';

export type { XcScore } from './types';

/** Scores a track in a worker. Resolves null when the track has no scorable route, rejects on solver errors. */
export function scoreFlight(fixes: Fix[], league: string): Promise<XcScore | null> {
  const rules = leagueOf(league)?.rules;
  if (!rules) return Promise.reject(new Error(`Unknown league "${league}".`));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./score.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ score?: XcScore | null; error?: string }>) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.score ?? null);
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };

    worker.postMessage({ fixes, league, rules });
  });
}

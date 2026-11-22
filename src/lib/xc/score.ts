import type { Fix } from '../domain/model';
import type { XcLeague } from '../state/xcPrefs';
import type { XcScore } from './types';

export type { XcScore } from './types';

/** Scores a track in a worker. Resolves null when the track has no scorable route, rejects on solver errors. */
export function scoreFlight(fixes: Fix[], league: XcLeague): Promise<XcScore | null> {
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
    worker.postMessage({ fixes, league });
  });
}

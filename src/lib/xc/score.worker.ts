import type { LeagueRule } from '#lib/plugins/api';

import type { Fix } from '../domain/model';
import { solveFlight } from './solve';

self.onmessage = (e: MessageEvent<{ fixes: Fix[]; league: string; rules: LeagueRule[] }>) => {
  const { fixes, league, rules } = e.data;
  try {
    self.postMessage({ score: solveFlight(fixes, league, rules) });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};

import { afterEach, describe, expect, it } from 'vitest';

import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';

import { DEFAULT_LEAGUE, leagueCacheId, leagueLabel, leagueOf, leagues } from './leagues';

const entry = (rules = [{ name: 'Free', type: 'free' as const, multiplier: 1 }]) => ({
  url: 'https://a.test/l.js',
  id: 'acme/l',
  name: 'L',
  kind: 'xc-planner' as const,
  leagues: [{ id: 'club', label: 'Club', rules }]
});

describe('leagues', () => {
  afterEach(() => {
    pluginPrefs.remove('acme/l');
    xcPrefs.set(DEFAULT_LEAGUE);
  });

  it('lists the bundled leagues first and the installed ones after', () => {
    const base = leagues();
    expect(base).toBe(leagues());
    expect(base.map((l) => l.id)).toEqual([
      'XContest',
      'FFVL',
      'FAI',
      'FAI-Cylinders',
      'FAI-OAR',
      'FAI-OAR2',
      'XCLeague'
    ]);
    expect(base[6].label).toBe('UK XC League');

    pluginPrefs.add(entry());
    expect(leagues()).not.toBe(base);
    expect(leagues().at(-1)).toMatchObject({ id: 'acme/l:club', label: 'Club' });
    expect(leagueLabel('acme/l:club')).toBe('Club');
    expect(leagueLabel('gone:x')).toBe('gone:x');
  });

  it('falls back to XContest when the chosen league was removed', () => {
    pluginPrefs.add(entry());
    xcPrefs.set('acme/l:club');
    expect(xcPrefs.league).toBe('acme/l:club');
    pluginPrefs.remove('acme/l');
    expect(leagueOf('acme/l:club')).toBeUndefined();
    expect(xcPrefs.league).toBe('XContest');
    xcPrefs.set('FFVL');
    expect(xcPrefs.league).toBe('FFVL');
  });

  it('keeps cache keys of bundled leagues and changes plugin keys with the rules', () => {
    expect(leagueCacheId('FFVL')).toBe('FFVL');
    pluginPrefs.add(entry());
    const a = leagueCacheId('acme/l:club');
    expect(a).toMatch(/^acme\/l:club~[0-9a-z]+$/);
    expect(leagueCacheId('acme/l:club')).toBe(a);
    pluginPrefs.remove('acme/l');
    pluginPrefs.add(entry([{ name: 'Free', type: 'free', multiplier: 2 }]));
    expect(leagueCacheId('acme/l:club')).not.toBe(a);
  });
});

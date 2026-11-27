import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { BackendPlugin, ConverterPlugin, PluginTrack } from './api';
import { validatePlugin } from './core';

const ROOT = join(process.cwd(), 'docs/plugins');
const STATIC = join(process.cwd(), 'static/plugins');

// Paths are built from fixed folders in this file.
// eslint-disable-next-line no-unsanitized/method -- test only, no user input
const load = async (path: string) => ((await import(pathToFileURL(path).href)) as { default: unknown }).default;
const examples = (kind: string) =>
  readdirSync(join(ROOT, kind, 'examples')).map((f) => join(ROOT, kind, 'examples', f));

describe('plugin examples', () => {
  const cases: [string, string[]][] = [
    ['studio', [join(STATIC, 'example.js'), join(STATIC, 'compass.js')]],
    ...['service', 'converter', 'xc-planner', 'badge', 'backend'].map((k): [string, string[]] => [k, examples(k)])
  ];

  for (const [kind, files] of cases) {
    for (const file of files) {
      it(`${file.split('/').slice(-2).join('/')} is a valid ${kind} plugin`, async () => {
        expect(validatePlugin(await load(file)).kind).toBe(kind);
      });
    }
  }

  it('converter example reads what it writes', async () => {
    const plugin = (await load(join(ROOT, 'converter/examples/csv.js'))) as ConverterPlugin;
    const track: PluginTrack = {
      pilot: 'p',
      glider: null,
      site: null,
      date: '2026-01-02',
      fixes: [{ t: Date.UTC(2026, 0, 2), lat: 47, lon: 8, alt: 1000 }]
    };
    const text = plugin.write?.(track) as string;
    const back = await plugin.read?.(new File([text], 'p.csv'));
    expect(back).toEqual(track);
  });

  it('backend example signs in and round trips a change', async () => {
    const plugin = (await load(join(ROOT, 'backend/examples/memory.js'))) as BackendPlugin;
    const adapter = plugin.create({ url: 'http://localhost' });
    await expect(adapter.signIn({ kind: 'password' }, { identity: 'x', password: 'y' })).rejects.toThrow();
    expect(await adapter.signIn({ kind: 'password' }, { identity: 'demo@example.com', password: 'demo' })).toEqual({
      user: 'demo@example.com'
    });
    expect(adapter.session()).not.toBeNull();

    await adapter.push([{ type: 'pref', id: 'a', updatedAt: 2, data: 'new' }]);
    await adapter.push([{ type: 'pref', id: 'a', updatedAt: 1, data: 'old' }]);
    const first = await adapter.pull(null);
    expect(first.changes).toEqual([{ type: 'pref', id: 'a', updatedAt: 2, data: 'new' }]);
    expect(first.more).toBe(false);

    const next = await adapter.pull(first.cursor);
    expect(next.changes).toEqual([]);
    await adapter.signOut();
    expect(adapter.session()).toBeNull();
  });
});

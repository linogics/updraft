import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPreset, loadSyncConfig, parseSyncConfig, syncUrl, writeOverride } from './config';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
});
afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body }))
  );

describe('syncUrl', () => {
  it('allows https and http only for this machine', () => {
    expect(syncUrl('https://sync.example.com/')).toBe('https://sync.example.com');
    expect(syncUrl('http://localhost:8090')).toBe('http://localhost:8090');
    expect(syncUrl('http://127.0.0.1:8090')).toBe('http://127.0.0.1:8090');
    expect(syncUrl('http://sync.example.com')).toBeNull();
    expect(syncUrl('javascript:alert(1)')).toBeNull();
    expect(syncUrl('nonsense')).toBeNull();
  });
});

describe('parseSyncConfig', () => {
  it('accepts a valid url and drops anything else', () => {
    expect(parseSyncConfig({ backend: 'old', url: 'https://a.example/', extra: 1 })).toEqual({
      url: 'https://a.example'
    });
  });

  it.each([null, 'x', {}, { url: 5 }, { url: 'http://a.example' }])('rejects %j', (raw) =>
    expect(parseSyncConfig(raw)).toBeNull()
  );
});

describe('preset and override', () => {
  const preset = { url: 'https://preset.example' };

  it('reads the sync key of config.json', async () => {
    answer({ sync: preset });

    expect(await fetchPreset()).toEqual(preset);
  });

  it('means no preset for a 404, bad JSON, a bad value or a network error', async () => {
    answer({}, false);
    expect(await fetchPreset()).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => Promise.reject(new Error('html')) }))
    );
    expect(await fetchPreset()).toBeNull();

    answer({ sync: { url: 'http://evil.example' } });
    expect(await fetchPreset()).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline')))
    );
    expect(await fetchPreset()).toBeNull();
  });

  it('lets the override win and falls back to the preset without one', async () => {
    answer({ sync: preset });
    expect((await loadSyncConfig()).config).toEqual(preset);

    const own = { url: 'http://localhost:8090' };
    writeOverride(own);
    expect(await loadSyncConfig()).toEqual({ config: own, preset });

    writeOverride(null);
    expect((await loadSyncConfig()).config).toEqual(preset);
  });

  it('ignores a damaged stored override', async () => {
    answer({}, false);
    localStorage.setItem('syncConfig', '{"url":"ftp://a"}');

    expect((await loadSyncConfig()).config).toBeNull();
  });
});

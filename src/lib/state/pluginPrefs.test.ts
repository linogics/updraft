import { describe, expect, it } from 'vitest';
import { parsePlugins, pluginUrl } from './pluginPrefs';

const ok = { url: 'https://a.test/wind.js', id: 'wind', name: 'Wind', dock: 'right' };

describe('parsePlugins', () => {
  it('keeps valid entries', () => {
    expect(parsePlugins([ok])).toEqual([ok]);
  });

  it('falls back to an empty list for anything that is not a list', () => {
    for (const raw of [null, undefined, 'x', 5, {}]) expect(parsePlugins(raw)).toEqual([]);
  });

  it('drops bad entries and keeps the good ones', () => {
    const bad = [
      null,
      'x',
      { ...ok, url: 'javascript:alert(1)' },
      { ...ok, url: 'nope' },
      { ...ok, id: 'Wind' },
      { ...ok, id: '' },
      { ...ok, name: '  ' },
      { ...ok, dock: 'top' }
    ];
    expect(parsePlugins([...bad, ok])).toEqual([ok]);
  });

  it('drops a repeated id or URL', () => {
    const other = { ...ok, id: 'other', url: 'https://a.test/other.js' };
    expect(parsePlugins([ok, { ...ok, url: 'https://b.test/x.js' }, { ...other, url: ok.url }, other])).toEqual([
      ok,
      other
    ]);
  });
});

describe('pluginUrl', () => {
  it('accepts http and https only', () => {
    expect(pluginUrl(' https://a.test/x.js ')).toBe('https://a.test/x.js');
    expect(pluginUrl('http://localhost:5000/x.js')).toBe('http://localhost:5000/x.js');
    for (const raw of ['data:text/javascript,1', 'blob:https://a.test/1', 'ftp://a.test/x', '/x.js', 5, null])
      expect(pluginUrl(raw)).toBeNull();
  });
});

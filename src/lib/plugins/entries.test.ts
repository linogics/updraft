import { describe, expect, it } from 'vitest';

import { pluginUrl } from './core';
import { parsePlugins } from './entries';

const ok = { url: 'https://a.test/wind.js', id: 'acme/wind', name: 'Wind', kind: 'studio', dock: 'right' };

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
      { ...ok, id: 'wind' },
      { ...ok, id: '' },
      { ...ok, name: '  ' },
      { ...ok, dock: 'top' },
      { ...ok, dock: undefined },
      { ...ok, kind: undefined },
      { ...ok, kind: 'widget' }
    ];
    expect(parsePlugins([...bad, ok])).toEqual([ok]);
  });

  it('drops a repeated id or URL', () => {
    const other = { ...ok, id: 'acme/other', url: 'https://a.test/other.js' };
    expect(parsePlugins([ok, { ...ok, url: 'https://b.test/x.js' }, { ...other, url: ok.url }, other])).toEqual([
      ok,
      other
    ]);
  });
});

describe('parsePlugins converter entries', () => {
  const conv = {
    url: 'https://a.test/csv.js',
    id: 'acme/csv',
    name: 'CSV',
    kind: 'converter',
    label: 'CSV',
    extensions: ['csv'],
    canRead: true,
    canWrite: false,
    mime: 'text/csv'
  };

  it('keeps a valid entry and drops stray fields', () => {
    expect(parsePlugins([{ ...conv, dock: 'left', junk: 1 }])).toEqual([conv]);
  });

  it.each([
    { label: ' ' },
    { extensions: [] },
    { extensions: ['CSV'] },
    { extensions: ['csv', 'csv'] },
    { extensions: undefined },
    { canRead: 'yes' },
    { canRead: false, canWrite: false },
    { mime: ' ' }
  ])('drops an entry with %j', (bad) => {
    expect(parsePlugins([{ ...conv, ...bad }])).toEqual([]);
  });
});

describe('parsePlugins xc-planner entries', () => {
  const entry = {
    url: 'https://a.test/t.js',
    id: 'acme/tasks',
    name: 'Tasks',
    kind: 'xc-planner',
    exports: [
      { label: 'CSV', extension: 'csv', mime: 'text/csv' },
      { label: 'TXT', extension: 'txt' }
    ]
  };

  it('keeps a valid entry and drops stray fields', () => {
    expect(parsePlugins([{ ...entry, dock: 'left', junk: 1 }])).toEqual([entry]);
  });

  it.each([
    { exports: undefined },
    { exports: [] },
    { exports: [{ label: ' ', extension: 'csv' }] },
    { exports: [{ label: 'A', extension: 'CSV' }] },
    {
      exports: [
        { label: 'A', extension: 'a' },
        { label: 'B', extension: 'a' }
      ]
    },
    { exports: [{ label: 'A', extension: 'a', mime: ' ' }] }
  ])('drops an entry with %j', (bad) => {
    expect(parsePlugins([{ ...entry, ...bad }])).toEqual([]);
  });
});

describe('parsePlugins xc-planner leagues', () => {
  const leagues = [
    {
      id: 'club',
      label: 'Club',
      rules: [{ name: 'Tri', type: 'fai', multiplier: 1.5, minSide: 0.28, closing: { fixed: 0 }, decimals: 1 }]
    }
  ];
  const base = { url: 'https://a.test/t.js', id: 'acme/tasks', name: 'Tasks', kind: 'xc-planner' };

  it('keeps leagues with or without exports and drops unknown keys', () => {
    const dirty = [{ ...leagues[0], x: 1, rules: [{ ...leagues[0].rules[0], y: 2 }] }];
    expect(parsePlugins([{ ...base, leagues: dirty }])).toEqual([{ ...base, leagues }]);
    const exports = [{ label: 'CSV', extension: 'csv' }];
    expect(parsePlugins([{ ...base, exports, leagues }])).toEqual([{ ...base, exports, leagues }]);
  });

  it.each([{}, { leagues: [] }, { leagues: [{ id: 'X', label: 'x', rules: [] }] }, { exports: [], leagues }])(
    'drops an entry with %j',
    (bad) => {
      expect(parsePlugins([{ ...base, ...bad }])).toEqual([]);
    }
  );
});

describe('pluginUrl', () => {
  it('accepts https and local http only', () => {
    expect(pluginUrl(' https://a.test/x.js ')).toBe('https://a.test/x.js');
    expect(pluginUrl('http://localhost:5000/x.js')).toBe('http://localhost:5000/x.js');
    for (const raw of [
      'data:text/javascript,1',
      'blob:https://a.test/1',
      'ftp://a.test/x',
      'http://a.test/x.js',
      '/x.js',
      5,
      null
    ]) {
      expect(pluginUrl(raw)).toBeNull();
    }
  });
});

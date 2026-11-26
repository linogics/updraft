import { describe, expect, it } from 'vitest';

import { validatePlugin } from './core';

const ok = { id: 'acme/wind', name: 'Wind', kind: 'studio', apiVersion: 2, dock: 'right', mount: () => {} };

describe('validatePlugin', () => {
  it('accepts a valid plugin, with or without drawExport', () => {
    expect(validatePlugin(ok)).toBe(ok);
    const withExport = { ...ok, drawExport: () => {} };
    expect(validatePlugin(withExport)).toBe(withExport);
    const withHosts = { ...ok, hosts: ['studio', 'plan'] };
    expect(validatePlugin(withHosts)).toBe(withHosts);
  });

  it.each([
    ['no module', undefined, /default export/],
    ['not an object', 'x', /default export/],
    ['missing id', { ...ok, id: undefined }, /"id"/],
    ['bad id', { ...ok, id: 'Wind Speed' }, /"id"/],
    ['id without vendor', { ...ok, id: 'wind' }, /"id"/],
    ['id with two slashes', { ...ok, id: 'a/b/c' }, /"id"/],
    ['uppercase vendor', { ...ok, id: 'Acme/wind' }, /"id"/],
    ['missing name', { ...ok, name: undefined }, /"name"/],
    ['blank name', { ...ok, name: ' ' }, /"name"/],
    ['missing kind', { ...ok, kind: undefined }, /"kind"/],
    ['unknown kind', { ...ok, kind: 'widget' }, /"kind"/],
    ['apiVersion 1', { ...ok, apiVersion: 1 }, /Unsupported apiVersion 1/],
    ['missing apiVersion', { ...ok, apiVersion: undefined }, /Unsupported apiVersion/],
    ['bad dock', { ...ok, dock: 'top' }, /"dock"/],
    ['empty hosts', { ...ok, hosts: [] }, /"hosts"/],
    ['unknown host', { ...ok, hosts: ['tv'] }, /"hosts"/],
    ['duplicate host', { ...ok, hosts: ['studio', 'studio'] }, /"hosts"/],
    ['hosts not a list', { ...ok, hosts: 'studio' }, /"hosts"/],
    ['mount not a function', { ...ok, mount: 'x' }, /"mount"/],
    ['drawExport not a function', { ...ok, drawExport: 1 }, /"drawExport"/],
    ['provides not an object', { ...ok, provides: 'x' }, /"provides"/],
    ['bad service name', { ...ok, provides: { wind: () => ({}) } }, /service name/],
    ['service major 0', { ...ok, provides: { 'acme/wind@0': () => ({}) } }, /service name/],
    ['factory not a function', { ...ok, provides: { 'acme/wind@1': {} } }, /factory/],
    ['requires not a list', { ...ok, requires: 'updraft/studio@1' }, /"requires"/],
    ['bad required name', { ...ok, requires: ['studio'] }, /"requires"/]
  ])('rejects %s', (_, mod, message) => {
    expect(() => validatePlugin(mod)).toThrow(message);
  });

  it('accepts provides and requires', () => {
    const withServices = { ...ok, provides: { 'acme/wind@1': () => ({}) }, requires: ['updraft/studio@1'] };
    expect(validatePlugin(withServices)).toBe(withServices);
  });

  describe('converter kind', () => {
    const conv = {
      id: 'acme/csv',
      name: 'CSV',
      kind: 'converter',
      apiVersion: 1,
      label: 'CSV',
      extensions: ['csv'],
      read: () => ({})
    };

    it('accepts a reader, a writer or both', () => {
      expect(validatePlugin(conv)).toBe(conv);
      const w = { ...conv, read: undefined, write: () => '', mime: 'text/csv' };
      expect(validatePlugin(w)).toBe(w);
    });

    it.each([
      ['apiVersion 2', { ...conv, apiVersion: 2 }, /Unsupported apiVersion 2/],
      ['blank label', { ...conv, label: ' ' }, /"label"/],
      ['no extensions', { ...conv, extensions: [] }, /"extensions"/],
      ['extensions not a list', { ...conv, extensions: 'csv' }, /"extensions"/],
      ['upper case extension', { ...conv, extensions: ['CSV'] }, /"extensions"/],
      ['dotted extension', { ...conv, extensions: ['.csv'] }, /"extensions"/],
      ['long extension', { ...conv, extensions: ['abcdefghijk'] }, /"extensions"/],
      ['duplicate extension', { ...conv, extensions: ['csv', 'csv'] }, /"extensions"/],
      ['blank mime', { ...conv, mime: ' ' }, /"mime"/],
      ['read not a function', { ...conv, read: 'x' }, /"read"/],
      ['write not a function', { ...conv, write: 1 }, /"write"/],
      ['neither read nor write', { ...conv, read: undefined }, /"read" or "write"/]
    ])('rejects %s', (_, mod, message) => {
      expect(() => validatePlugin(mod)).toThrow(message);
    });
  });

  describe('xc-planner kind', () => {
    const exp = { label: 'CSV', extension: 'csv', write: () => '' };
    const planner = { id: 'acme/tasks', name: 'Tasks', kind: 'xc-planner', apiVersion: 1, exports: [exp] };

    it('accepts exports', () => {
      expect(validatePlugin(planner)).toBe(planner);
      const two = {
        ...planner,
        exports: [
          { ...exp, mime: 'text/csv' },
          { ...exp, extension: 'txt' }
        ]
      };
      expect(validatePlugin(two)).toBe(two);
    });

    const rule = { name: 'Free', type: 'free', multiplier: 1 };
    const league = { id: 'club', label: 'Club', rules: [rule] };
    const withLeague = (l: unknown) => ({ ...planner, leagues: [l] });

    it('accepts leagues alone or with exports', () => {
      const only = { ...planner, exports: undefined, leagues: [league] };
      expect(validatePlugin(only)).toBe(only);
      const both = { ...planner, leagues: [league] };
      expect(validatePlugin(both)).toBe(both);
      const full = withLeague({
        ...league,
        rules: [
          {
            name: 'T',
            type: 'flat',
            multiplier: 2,
            minSide: 0.15,
            maxSide: 0.45,
            minDistance: 5,
            closing: { fixed: 0.8, free: 0.8, relative: 0.1 },
            cylinders: 0.4,
            decimals: 1
          }
        ]
      });
      expect(validatePlugin(full)).toBe(full);
    });

    it.each([
      ['empty leagues', { ...planner, leagues: [] }, /"leagues"/],
      [
        '21 leagues',
        { ...planner, leagues: Array.from({ length: 21 }, (_, i) => ({ ...league, id: `l${i}` })) },
        /"leagues"/
      ],
      ['league not an object', withLeague(5), /must be an object/],
      ['bad id', withLeague({ ...league, id: 'Club' }), /"id"/],
      ['long id', withLeague({ ...league, id: 'a'.repeat(41) }), /"id"/],
      ['duplicate id', { ...planner, leagues: [league, league] }, /used twice/],
      ['blank label', withLeague({ ...league, label: ' ' }), /"label"/],
      ['no rules', withLeague({ ...league, rules: [] }), /"rules"/],
      ['11 rules', withLeague({ ...league, rules: Array.from({ length: 11 }, () => rule) }), /"rules"/],
      ['rule not an object', withLeague({ ...league, rules: [null] }), /must be an object/],
      ['blank rule name', withLeague({ ...league, rules: [{ ...rule, name: ' ' }] }), /"name"/],
      ['bad type', withLeague({ ...league, rules: [{ ...rule, type: 'x' }] }), /"type"/],
      ['zero multiplier', withLeague({ ...league, rules: [{ ...rule, multiplier: 0 }] }), /"multiplier"/],
      ['multiplier 11', withLeague({ ...league, rules: [{ ...rule, multiplier: 11 }] }), /"multiplier"/],
      ['NaN multiplier', withLeague({ ...league, rules: [{ ...rule, multiplier: NaN }] }), /"multiplier"/],
      ['minSide on free', withLeague({ ...league, rules: [{ ...rule, minSide: 0.2 }] }), /"minSide"/],
      ['minSide 0.5', withLeague({ ...league, rules: [{ ...rule, type: 'fai', minSide: 0.5 }] }), /"minSide"/],
      ['maxSide on fai', withLeague({ ...league, rules: [{ ...rule, type: 'fai', maxSide: 0.4 }] }), /"maxSide"/],
      [
        'maxSide below minSide',
        withLeague({ ...league, rules: [{ ...rule, type: 'flat', minSide: 0.3, maxSide: 0.2 }] }),
        /"maxSide"/
      ],
      ['negative minDistance', withLeague({ ...league, rules: [{ ...rule, minDistance: -1 }] }), /"minDistance"/],
      ['closing on free', withLeague({ ...league, rules: [{ ...rule, closing: {} }] }), /"closing"/],
      [
        'negative closing',
        withLeague({ ...league, rules: [{ ...rule, type: 'oar', closing: { fixed: -1 } }] }),
        /closing.fixed/
      ],
      [
        'closing over 100',
        withLeague({ ...league, rules: [{ ...rule, type: 'oar', closing: { free: 101 } }] }),
        /closing.free/
      ],
      [
        'relative over 1',
        withLeague({ ...league, rules: [{ ...rule, type: 'oar', closing: { relative: 2 } }] }),
        /closing.relative/
      ],
      ['cylinders over 5', withLeague({ ...league, rules: [{ ...rule, cylinders: 6 }] }), /"cylinders"/],
      ['decimals 3', withLeague({ ...league, rules: [{ ...rule, decimals: 3 }] }), /"decimals"/]
    ])('rejects %s', (_, mod, message) => {
      expect(() => validatePlugin(mod)).toThrow(message);
    });

    it.each([
      ['apiVersion 2', { ...planner, apiVersion: 2 }, /Unsupported apiVersion 2/],
      ['no exports and no leagues', { ...planner, exports: undefined }, /"exports"/],
      ['empty exports', { ...planner, exports: [] }, /"exports"/],
      [
        '11 exports',
        { ...planner, exports: Array.from({ length: 11 }, (_, i) => ({ ...exp, extension: `e${i}` })) },
        /"exports"/
      ],
      ['export not an object', { ...planner, exports: [5] }, /must be an object/],
      ['blank label', { ...planner, exports: [{ ...exp, label: ' ' }] }, /"label"/],
      ['upper case extension', { ...planner, exports: [{ ...exp, extension: 'CSV' }] }, /"extension"/],
      ['long extension', { ...planner, exports: [{ ...exp, extension: 'abcdefghijk' }] }, /"extension"/],
      ['duplicate extension', { ...planner, exports: [exp, exp] }, /unique/],
      ['blank mime', { ...planner, exports: [{ ...exp, mime: ' ' }] }, /"mime"/],
      ['no write', { ...planner, exports: [{ ...exp, write: undefined }] }, /"write"/]
    ])('rejects %s', (_, mod, message) => {
      expect(() => validatePlugin(mod)).toThrow(message);
    });
  });

  describe('service kind', () => {
    const svc = { id: 'acme/svc', name: 'Svc', kind: 'service', apiVersion: 1, provides: { 'acme/svc@1': () => ({}) } };

    it('accepts a headless plugin that provides a service', () => {
      expect(validatePlugin(svc)).toBe(svc);
    });

    it.each([
      ['no provides', { ...svc, provides: undefined }, /at least one service/],
      ['empty provides', { ...svc, provides: {} }, /at least one service/],
      ['wrong apiVersion', { ...svc, apiVersion: 2 }, /Unsupported apiVersion 2/]
    ])('rejects %s', (_, mod, message) => {
      expect(() => validatePlugin(mod)).toThrow(message);
    });
  });

  describe('backend kind', () => {
    const be = { id: 'acme/be', name: 'Be', kind: 'backend', apiVersion: 1, create: () => ({}) };

    it('accepts a backend with a create function', () => {
      expect(validatePlugin(be)).toBe(be);
    });

    it.each([
      ['no create', { ...be, create: undefined }, /"create"/],
      ['create not a function', { ...be, create: {} }, /"create"/],
      ['wrong apiVersion', { ...be, apiVersion: 2 }, /Unsupported apiVersion 2/]
    ])('rejects %s', (_, mod, message) => {
      expect(() => validatePlugin(mod)).toThrow(message);
    });
  });

  it('rejects an id that is taken, whatever the kind of the other plugin', () => {
    // The taken list holds ids only, so a plugin of another kind clashes the same way.
    expect(() => validatePlugin(ok, ['acme/wind'])).toThrow(/already in use/);
  });
});

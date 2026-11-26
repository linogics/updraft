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

import { describe, expect, it } from 'vitest';
import { validatePlugin } from './plugins';

const ok = { id: 'wind', name: 'Wind', apiVersion: 1, dock: 'right', mount: () => {} };

describe('validatePlugin', () => {
  it('accepts a valid plugin, with or without drawExport', () => {
    expect(validatePlugin(ok)).toBe(ok);
    const withExport = { ...ok, drawExport: () => {} };
    expect(validatePlugin(withExport)).toBe(withExport);
  });

  it.each([
    ['no module', undefined, /default export/],
    ['not an object', 'x', /default export/],
    ['missing id', { ...ok, id: undefined }, /"id"/],
    ['bad id', { ...ok, id: 'Wind Speed' }, /"id"/],
    ['missing name', { ...ok, name: undefined }, /"name"/],
    ['blank name', { ...ok, name: ' ' }, /"name"/],
    ['apiVersion 2', { ...ok, apiVersion: 2 }, /Unsupported apiVersion 2/],
    ['missing apiVersion', { ...ok, apiVersion: undefined }, /Unsupported apiVersion/],
    ['bad dock', { ...ok, dock: 'top' }, /"dock"/],
    ['mount not a function', { ...ok, mount: 'x' }, /"mount"/],
    ['drawExport not a function', { ...ok, drawExport: 1 }, /"drawExport"/]
  ])('rejects %s', (_, mod, message) => {
    expect(() => validatePlugin(mod)).toThrow(message);
  });

  it('rejects an id that is taken', () => {
    expect(() => validatePlugin(ok, ['wind'])).toThrow(/already in use/);
  });
});

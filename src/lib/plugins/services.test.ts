import { describe, expect, it, vi } from 'vitest';
import { assertNotReserved, ServiceRegistry } from './services';

describe('ServiceRegistry', () => {
  it('builds a service lazily and only once', () => {
    const r = new ServiceRegistry();
    const factory = vi.fn(() => ({ n: 1 }));
    r.provide('a/x@1', factory, 'a/p');
    expect(factory).not.toHaveBeenCalled();
    expect(r.use('a/x@1')).toBe(r.use('a/x@1'));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('throws for a missing service and reports what is missing', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', () => ({}), 'a/p');
    expect(() => r.use('a/y@1')).toThrow('Missing service "a/y@1". Add a plugin that provides it.');
    expect(r.has('a/x@1')).toBe(true);
    expect(r.missing(['a/x@1', 'a/y@1'])).toEqual(['a/y@1']);
    expect(r.missing(undefined)).toEqual([]);
  });

  it('refuses a second provider and keeps the first', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', () => ({ who: 1 }), 'a/one');
    expect(() => r.provide('a/x@1', () => ({ who: 2 }), 'a/two')).toThrow(/already provided by "a\/one"/);
    expect(r.use('a/x@1')).toEqual({ who: 1 });
  });

  it('lets a factory use other services', () => {
    const r = new ServiceRegistry();
    r.provide('a/base@1', () => ({ v: 2 }), 'a/p');
    r.provide('a/top@1', (ctx) => ({ v: ctx.use<{ v: number }>('a/base@1').v * 2 }), 'a/p');
    expect(r.use('a/top@1')).toEqual({ v: 4 });
  });

  it('detects a cycle and recovers', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', (ctx) => ctx.use('a/y@1'), 'a/p');
    r.provide('a/y@1', (ctx) => ctx.use('a/x@1'), 'a/p');
    expect(() => r.use('a/x@1')).toThrow(/cycle: "a\/x@1" -> "a\/y@1" -> "a\/x@1"/);
    // The build stack is clean, so a later call reports the cycle again instead of a wrong state.
    expect(() => r.use('a/y@1')).toThrow(/cycle/);
  });

  it('drops the instance on unregister', () => {
    const r = new ServiceRegistry();
    const factory = vi.fn(() => ({}));
    const off = r.provide('a/x@1', factory, 'a/p');
    r.use('a/x@1');
    off();
    expect(r.has('a/x@1')).toBe(false);
    expect(() => r.use('a/x@1')).toThrow(/Missing/);
    r.provide('a/x@1', factory, 'a/p');
    r.use('a/x@1');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('unregisters everything of one owner', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', () => ({}), 'a/p');
    r.provide('a/y@1', () => ({}), 'a/p');
    r.provide('b/z@1', () => ({}), 'b/q');
    r.unregisterOwner('a/p');
    expect(r.missing(['a/x@1', 'a/y@1', 'b/z@1'])).toEqual(['a/x@1', 'a/y@1']);
  });

  it('rebuilds a dependent when its dependency is provided again', () => {
    const r = new ServiceRegistry();
    const off = r.provide('a/base@1', () => ({ v: 1 }), 'a/p');
    r.provide('b/top@1', (ctx) => ({ v: ctx.use<{ v: number }>('a/base@1').v }), 'b/q');
    expect(r.use('b/top@1')).toEqual({ v: 1 });
    off();
    r.provide('a/base@1', () => ({ v: 2 }), 'a/p');
    expect(r.use('b/top@1')).toEqual({ v: 2 });
  });
});

describe('assertNotReserved', () => {
  it('refuses the reserved namespace as id and as service name', () => {
    expect(() => assertNotReserved({ id: 'updraft/x' })).toThrow(/reserved/);
    expect(() => assertNotReserved({ id: 'a/x', provides: { 'updraft/studio@1': () => ({}) } })).toThrow(/reserved/);
    expect(() => assertNotReserved({ id: 'a/x', provides: { 'a/studio@1': () => ({}) } })).not.toThrow();
  });
});

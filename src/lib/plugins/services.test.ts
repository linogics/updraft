import { describe, expect, it, vi } from 'vitest';

import type { ServiceSchema } from './api';
import { assertNotReserved, ServiceRegistry, validateServiceFields } from './services';

const prov = (name: string) => ({ schema: { name, description: '', methods: {} }, create: () => ({}) });

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
    expect(() => assertNotReserved({ id: 'a/x', provides: { 'updraft/studio@1': prov('updraft/studio@1') } })).toThrow(
      /reserved/
    );
    expect(() => assertNotReserved({ id: 'a/x', provides: { 'a/studio@1': prov('a/studio@1') } })).not.toThrow();
  });
});

describe('checked access', () => {
  const schema: ServiceSchema = {
    name: 'a/x@1',
    description: 'Test.',
    methods: {
      double: {
        description: 'Doubles.',
        access: 'read',
        params: [{ name: 'n', schema: { type: 'number' } }],
        returns: { type: 'number' }
      }
    }
  };
  const create = () => ({ double: (n: number) => (n === 3 ? 'six' : n * 2), extra: () => 1 });

  it('checks calls of an installed provider and hides undeclared members', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', create, 'acme/plugin', schema);
    const s = r.use<{ double(n: unknown): unknown; extra?: unknown }>('a/x@1');
    expect(s.double(2)).toBe(4);
    expect(() => s.double('2')).toThrow('a/x@1.double: n: expected number');
    expect(() => s.double(3)).toThrow('a/x@1.double: double(): expected number');
    expect(s.extra).toBeUndefined();
    expect(r.use('a/x@1')).toBe(s);
  });

  it('lists schemas and finds them by name', () => {
    const r = new ServiceRegistry();
    r.provide('a/x@1', create, 'acme/plugin', schema);
    r.provide('a/y@1', () => ({}), 'updraft');
    expect(r.schemaOf('a/x@1')).toBe(schema);
    expect(r.list()).toEqual([
      { name: 'a/x@1', owner: 'acme/plugin', schema },
      { name: 'a/y@1', owner: 'updraft', schema: undefined }
    ]);
  });

  it('never checks a service without schema', () => {
    const r = new ServiceRegistry();
    const raw = { v: 1 };
    r.provide('a/x@1', () => raw, 'acme/plugin');
    expect(r.use('a/x@1')).toBe(raw);
  });
});

describe('validateServiceFields', () => {
  it('rejects a schema that is not an object', () => {
    expect(() => validateServiceFields({ provides: { 'a/x@1': { create: () => ({}), schema: 5 } } })).toThrow(
      /"schema"/
    );
  });
});

describe('grants', () => {
  const schema: ServiceSchema = {
    name: 'a/x@1',
    description: '',
    methods: {
      get: { access: 'read', params: [], returns: { type: 'number' } },
      set: { access: 'write', params: [], returns: { 'x-kind': 'void' } }
    }
  } as unknown as ServiceSchema;

  function setup(grants: string[]) {
    const r = new ServiceRegistry();
    r.provide('a/x@1', () => ({ get: () => 1, set: () => {} }), 'updraft/core', schema);
    r.setGrants(() => grants);
    return { r, grants };
  }

  it('denies a write of an installed plugin without a grant but allows reads', () => {
    const { r } = setup([]);
    const s = r.use<{ get(): number; set(): void }>('a/x@1', 'acme/p');
    expect(s.get()).toBe(1);
    expect(() => s.set()).toThrow('acme/p may not change a/x@1. Allow it in the plugin settings.');
  });

  it('allows a granted write and follows a revoke without a new use call', () => {
    const grants = ['a/x@1'];
    const r = new ServiceRegistry();
    r.provide('a/x@1', () => ({ get: () => 1, set: () => {} }), 'updraft/core', schema);
    r.setGrants(() => grants);
    const s = r.use<{ set(): void }>('a/x@1', 'acme/p');
    expect(() => s.set()).not.toThrow();
    grants.length = 0;
    expect(() => s.set()).toThrow(/may not change/);
  });

  it('exempts bundled callers', () => {
    const { r } = setup([]);
    expect(() => r.use<{ set(): void }>('a/x@1', 'updraft/xc').set()).not.toThrow();
    expect(() => r.use<{ set(): void }>('a/x@1').set()).not.toThrow();
  });
});

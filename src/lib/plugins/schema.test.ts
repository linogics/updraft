import { describe, expect, it } from 'vitest';

import type { JsonSchema, ServiceSchema } from './api';
import { coreSchemas } from './coreSchemas';
import { checkService, validate } from './schema';

const defs: Record<string, JsonSchema> = {
  Fix: { type: 'object', properties: { lat: { type: 'number' }, note: { type: 'string' } }, required: ['lat'] }
};
const flights: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { fixes: { type: 'array', items: { $ref: '#/$defs/Fix' } } },
    required: ['fixes']
  }
};

describe('validate', () => {
  it.each<[string, JsonSchema, unknown, string | null]>([
    ['string', { type: 'string' }, 'a', null],
    ['string wrong', { type: 'string' }, 1, 'v: expected string'],
    ['NaN', { type: 'number' }, NaN, 'v: expected number'],
    ['Infinity', { type: 'number' }, Infinity, 'v: expected number'],
    ['integer', { type: 'integer' }, 1.5, 'v: expected integer'],
    ['minimum', { type: 'number', minimum: 1 }, 0, 'v: must be at least 1'],
    ['maximum', { type: 'number', maximum: 1 }, 2, 'v: must be at most 1'],
    ['boolean', { type: 'boolean' }, 'x', 'v: expected boolean'],
    ['null', { type: 'null' }, undefined, 'v: expected null'],
    ['enum', { type: 'string', enum: ['a', 'b'] }, 'c', 'v: expected one of "a", "b"'],
    ['const', { const: true }, false, 'v: expected true'],
    ['anyOf ok', { anyOf: [{ type: 'string' }, { type: 'null' }] }, null, null],
    ['anyOf bad', { anyOf: [{ type: 'string' }, { type: 'null' }] }, 1, 'v: matches none of the allowed types'],
    ['array not array', { type: 'array' }, {}, 'v: expected array'],
    ['object not object', { type: 'object' }, [], 'v: expected object'],
    ['function', { 'x-kind': 'function' }, () => 1, null],
    ['function wrong', { 'x-kind': 'function' }, 1, 'v: expected function'],
    ['opaque', { 'x-kind': 'opaque' }, 1, null],
    ['void', { 'x-kind': 'void' }, 1, 'v: expected no value'],
    ['promise', { 'x-kind': 'promise' }, Promise.resolve(1), null],
    ['promise wrong', { 'x-kind': 'promise' }, 1, 'v: expected promise'],
    ['unknown', {}, 1, null],
    ['unknown ref', { $ref: '#/$defs/Nope' }, 1, 'v: unknown reference #/$defs/Nope'],
    ['no extra', { type: 'object', additionalProperties: false }, { a: 1 }, 'v.a: unexpected field'],
    ['record', { type: 'object', additionalProperties: { type: 'number' } }, { a: 'x' }, 'v.a: expected number'],
    ['missing required', defs.Fix, {}, 'v.lat: expected number']
  ])('%s', (_, schema, value, expected) => {
    expect(validate(schema, value, defs, 'v')).toBe(expected);
  });

  it('names the full path of a nested mismatch', () => {
    const value = [{ fixes: [{ lat: 1 }, { lat: 2 }, { lat: 3 }, { lat: 'x' }] }];
    expect(validate(flights, value, defs, 'flights()')).toBe('flights()[0].fixes[3].lat: expected number');
  });

  it('treats undefined optional fields as absent', () => {
    expect(validate(defs.Fix, { lat: 1, note: undefined }, defs, 'v')).toBeNull();
  });
});

describe('checkService', () => {
  const schema: ServiceSchema = {
    name: 'a/x@1',
    description: '',
    $defs: defs,
    events: { change: { description: '' } },
    methods: {
      all: { description: '', access: 'read', params: [], returns: flights },
      set: {
        description: '',
        access: 'write',
        params: [{ name: 'lat', optional: true, schema: { type: 'number' } }],
        returns: { 'x-kind': 'void' }
      }
    }
  };

  it('checks a result once per object and the event names', () => {
    const list = [{ fixes: [{ lat: 1 }] }];
    let reads = 0;
    const s = checkService(schema, {
      all: () => (reads++ ? list : list),
      set: (...args: unknown[]) => void args,
      on: (e: string) => () => e
    });
    expect(s.all()).toBe(list);
    list[0].fixes[0].lat = 'x' as never;
    // Same object, already checked.
    expect(s.all()).toBe(list);
    expect(() => s.set('x')).toThrow('a/x@1.set: lat: expected number');
    expect(() => s.set()).not.toThrow();
    expect(() => (s as { on(e: string, fn: () => void): void }).on('nope', () => {})).toThrow(
      'Unknown event "nope" of a/x@1.'
    );
    expect(() => (s as { on(e: string, fn: () => void): void }).on('change', () => {})).not.toThrow();
  });

  it('throws when the result does not fit', () => {
    const s = checkService(schema, { all: () => [{ fixes: [{ lat: 'x' }] }], set: () => {}, on: () => () => {} });
    expect(() => s.all()).toThrow('a/x@1.all: all()[0].fixes[0].lat: expected number');
  });
});

describe('checkService with promises', () => {
  const schema: ServiceSchema = {
    name: 'a/y@1',
    description: '',
    methods: {
      names: {
        description: '',
        access: 'read',
        params: [],
        returns: { 'x-kind': 'promise', resolves: { type: 'array', items: { type: 'string' } } }
      }
    }
  };

  it('checks the resolved value', async () => {
    const ok = checkService(schema, { names: () => Promise.resolve(['a']) });
    await expect(ok.names()).resolves.toEqual(['a']);

    const bad = checkService(schema, { names: () => Promise.resolve([1]) });
    await expect(bad.names()).rejects.toThrow('a/y@1.names: names()[0]: expected string');
  });

  it('passes a rejection through and rejects a non promise', async () => {
    const boom = new Error('boom');
    const s = checkService(schema, { names: () => Promise.reject(boom) });
    await expect(s.names()).rejects.toBe(boom);

    const sync = checkService(schema, { names: () => ['a'] });
    expect(() => sync.names()).toThrow('a/y@1.names: names(): expected promise');
  });
});

describe('core schemas', () => {
  it.each(coreSchemas.map((s) => [s.name, s] as const))('%s is well formed', (_, s) => {
    for (const [name, m] of Object.entries(s.methods)) {
      expect(['read', 'write'], name).toContain(m.access);
      expect(m.description, name).not.toBe('');
    }
  });
});

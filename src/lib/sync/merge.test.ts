import { describe, expect, it } from 'vitest';

import { mergeItems } from './merge';

describe('mergeItems', () => {
  it('keeps the newer value per field', () => {
    const out = mergeItems(
      { data: { a: 'l', b: 'l' }, times: { a: 2, b: 1 } },
      { data: { a: 'r', b: 'r' }, times: { a: 1, b: 2 } }
    );
    expect(out).toEqual({ data: { a: 'l', b: 'r' }, times: { a: 2, b: 2 } });
  });

  it('keeps the remote value on a tie', () => {
    const out = mergeItems({ data: { a: 'l' }, times: { a: 5 } }, { data: { a: 'r' }, times: { a: 5 } });
    expect(out.data.a).toBe('r');
  });

  it('counts a missing time as oldest', () => {
    const out = mergeItems({ data: { a: 'l', b: 'l' }, times: { a: 1 } }, { data: { a: 'r', c: 'r' }, times: {} });
    expect(out.data).toEqual({ a: 'l', b: 'l', c: 'r' });
    expect(out.times).toEqual({ a: 1 });
  });

  it('drops a field the newer side does not have', () => {
    const out = mergeItems({ data: {}, times: { a: 9 } }, { data: { a: 'r' }, times: { a: 1 } });
    expect(out.data).toEqual({});
    expect(out.times).toEqual({ a: 9 });
  });
});

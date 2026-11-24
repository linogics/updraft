import { describe, expect, it } from 'vitest';
import { dropIndex } from './dropIndex';

describe('dropIndex', () => {
  const mids = [10, 30, 50];

  it('drops before the first midpoint the pointer has not passed', () => {
    expect(dropIndex(mids, 5)).toBe(0);
    expect(dropIndex(mids, 20)).toBe(1);
    expect(dropIndex(mids, 49)).toBe(2);
  });

  it('resolves a pointer past either edge to the first or last place', () => {
    expect(dropIndex(mids, -100)).toBe(0);
    expect(dropIndex(mids, 1000)).toBe(3);
  });

  it('puts the item at 0 in an empty list', () => {
    expect(dropIndex([], 40)).toBe(0);
  });
});

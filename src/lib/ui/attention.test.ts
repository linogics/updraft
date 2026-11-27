import { describe, expect, it } from 'vitest';

import { sortByName } from './attention';

describe('sortByName', () => {
  it('orders by name ignoring case and leaves the input alone', () => {
    const input = ['banana', 'apple', 'Cherry'];
    expect(sortByName(input, (s) => s)).toEqual(['apple', 'banana', 'Cherry']);
    expect(input[0]).toBe('banana');
  });
});

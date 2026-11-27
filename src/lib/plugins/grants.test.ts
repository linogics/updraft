import { describe, expect, it } from 'vitest';

import { writeServices } from './grants';

describe('writeServices', () => {
  it('lists the write methods of core services and skips read only ones', () => {
    const [flights, ...rest] = writeServices(['updraft/flights@1', 'updraft/flight-analysis@1', 'a/unknown@1']);
    expect(flights.name).toBe('updraft/flights@1');
    expect(flights.methods).toEqual(expect.arrayContaining(['save', 'delete']));
    expect(rest.map((w) => w.name)).not.toContain('updraft/flight-analysis@1');
    expect(writeServices(undefined)).toEqual([]);
  });
});

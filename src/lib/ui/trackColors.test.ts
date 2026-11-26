import { describe, expect, it } from 'vitest';

import { colorRuns } from './trackColors';

describe('colorRuns', () => {
  it('colours each segment by its first fix and merges equal neighbours', () => {
    const colors = ['a', 'a', 'b', 'b', 'b', 'a'];

    // The last fix only ends the final segment, so its own colour is not used.
    expect(colorRuns(colors.length, (i) => colors[i])).toEqual([
      { color: 'a', start: 0, end: 2 },
      { color: 'b', start: 2, end: 5 }
    ]);
  });

  it('is one run for a single colour', () => {
    expect(colorRuns(4, () => 'x')).toEqual([{ color: 'x', start: 0, end: 3 }]);
  });

  it('is empty without a segment', () => {
    expect(colorRuns(0, () => 'x')).toEqual([]);
    expect(colorRuns(1, () => 'x')).toEqual([]);
  });
});

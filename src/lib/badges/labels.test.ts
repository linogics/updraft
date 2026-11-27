import { describe, expect, it } from 'vitest';

import { parseUnits } from '#lib/ui/units';

import { formatBadgeValue } from './labels';

describe('formatBadgeValue', () => {
  it('formats a duration in seconds', () => {
    expect(formatBadgeValue('duration', 3600, parseUnits(null))).toMatch(/1/);
  });
});

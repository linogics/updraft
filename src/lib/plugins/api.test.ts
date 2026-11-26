import { describe, expect, it } from 'vitest';

import src from './api.d.ts?raw';

describe('plugin api types', () => {
  it('stays self-contained', () => {
    expect(src).not.toMatch(/from '(#lib|\.\.?\/)/);
    expect(src).not.toMatch(/-state@/);
  });
});

import { describe, expect, it } from 'vitest';

import { validatePlugin } from '#lib/plugins/core';

import compass, { cardinal } from '../../../static/plugins/compass.js';

describe('static/plugins/compass.js', () => {
  it('follows the plugin contract', () => {
    expect(validatePlugin(compass).id).toBe('example/compass');
    expect(typeof compass.drawExport).toBe('function');
  });

  it('names the compass point', () => {
    expect(cardinal(0)).toBe('N');
    expect(cardinal(273)).toBe('W');
    expect(cardinal(359)).toBe('N');
  });
});

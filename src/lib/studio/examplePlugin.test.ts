import { describe, expect, it } from 'vitest';

import { validatePlugin } from '#lib/plugins/core';

import example from '../../../static/plugins/example.js';

describe('static/plugins/example.js', () => {
  it('follows the plugin contract', () => {
    expect(validatePlugin(example).id).toBe('example/altitude');
    expect(typeof example.drawExport).toBe('function');
  });
});

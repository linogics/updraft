import { describe, expect, it } from 'vitest';
import example from '../../../static/plugins/example.js';
import { validatePlugin } from '#lib/plugins/core';

describe('static/plugins/example.js', () => {
  it('follows the plugin contract', () => {
    expect(validatePlugin(example).id).toBe('example/altitude');
    expect(typeof example.drawExport).toBe('function');
  });
});

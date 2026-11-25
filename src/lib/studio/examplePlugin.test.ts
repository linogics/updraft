import { describe, expect, it } from 'vitest';
import example from '../../../static/plugins/example.js';
import { validatePlugin } from './plugins';

describe('static/plugins/example.js', () => {
  it('follows the plugin contract', () => {
    expect(validatePlugin(example).id).toBe('example');
    expect(typeof example.drawExport).toBe('function');
  });
});

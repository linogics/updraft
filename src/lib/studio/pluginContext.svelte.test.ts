import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { services } from '#lib/plugins/services';
import type { StudioState } from '#lib/state/studio.svelte';
import { createPluginContext } from './pluginContext.svelte';

describe('plugin context use()', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ style: {}, remove() {} }) });
    services.provide('t/a@1', () => ({ ok: true }), 't/owner');
    services.provide('t/b@1', () => ({}), 't/owner');
  });

  afterEach(() => {
    services.unregisterOwner('t/owner');
    vi.unstubAllGlobals();
  });

  it('hands out required services only', () => {
    const { ctx, dispose } = createPluginContext({ viewsEl: null } as StudioState, ['t/a@1'], () => {});
    expect(ctx.use('t/a@1')).toEqual({ ok: true });
    expect(() => ctx.use('t/b@1')).toThrow('Service "t/b@1" is not in requires.');
    dispose();
  });
});

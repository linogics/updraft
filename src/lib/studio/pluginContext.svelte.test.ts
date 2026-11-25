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
    const { ctx, dispose } = createPluginContext({ viewsEl: null } as StudioState, 't/p', ['t/a@1'], () => {});
    expect(ctx.use('t/a@1')).toEqual({ ok: true });
    expect(() => ctx.use('t/b@1')).toThrow('Service "t/b@1" is not in requires.');
    dispose();
  });

  it('keeps updraft/*-state services for bundled plugins', () => {
    services.provide('updraft/x-state@1', () => ({}), 't/owner');
    const user = createPluginContext({ viewsEl: null } as StudioState, 't/p', ['updraft/x-state@1'], () => {});
    expect(() => user.ctx.use('updraft/x-state@1')).toThrow('internal to bundled plugins');
    const own = createPluginContext({ viewsEl: null } as StudioState, 'updraft/p', ['updraft/x-state@1'], () => {});
    expect(own.ctx.use('updraft/x-state@1')).toEqual({});
  });

  it('creates the overlay on first access only', () => {
    const create = vi.fn(() => ({ style: {}, remove() {} }));
    vi.stubGlobal('document', { createElement: create });
    const { ctx } = createPluginContext({ viewsEl: null } as StudioState, 't/p', [], () => {});
    expect(create).not.toHaveBeenCalled();
    expect(ctx.overlay).toBe(ctx.overlay);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { services } from '#lib/plugins/services';
import { createPluginContext, type PluginHostEnv } from './pluginContext.svelte';

const host: PluginHostEnv = { overlayParent: () => null, watch: () => {} };

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
    const { ctx, dispose } = createPluginContext(host, 't/p', ['t/a@1'], () => {});
    expect(ctx.use('t/a@1')).toEqual({ ok: true });
    expect(() => ctx.use('t/b@1')).toThrow('Service "t/b@1" is not in requires.');
    dispose();
  });

  it('keeps updraft/*-state services for bundled plugins', () => {
    services.provide('updraft/x-state@1', () => ({}), 't/owner');
    const user = createPluginContext(host, 't/p', ['updraft/x-state@1'], () => {});
    expect(() => user.ctx.use('updraft/x-state@1')).toThrow('internal to bundled plugins');
    const own = createPluginContext(host, 'updraft/p', ['updraft/x-state@1'], () => {});
    expect(own.ctx.use('updraft/x-state@1')).toEqual({});
  });

  it('creates the overlay on first access only', () => {
    const create = vi.fn(() => ({ style: {}, remove() {} }));
    vi.stubGlobal('document', { createElement: create });
    const { ctx } = createPluginContext(host, 't/p', [], () => {});
    expect(create).not.toHaveBeenCalled();
    expect(ctx.overlay).toBe(ctx.overlay);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses need where the host has none', () => {
    const { ctx } = createPluginContext(host, 't/p', [], () => {});
    expect(() => ctx.need('xc')).toThrow('not available in the planner');
  });

  it('adds the overlay to the host element', () => {
    const parent = { append: vi.fn() };
    const el = { style: {}, remove() {} };
    vi.stubGlobal('document', { createElement: () => el });
    const { ctx } = createPluginContext({ ...host, overlayParent: () => parent as never }, 't/p', [], () => {});
    expect(ctx.overlay).toBe(el);
    expect(parent.append).toHaveBeenCalledWith(el);
  });
});

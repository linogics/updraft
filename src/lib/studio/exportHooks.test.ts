import { describe, expect, it, vi } from 'vitest';

import { paintPlugins } from './exportHooks.svelte';
import type { StudioPlugin } from './plugins';

// Minimal 2D context with a save/restore stack for fillStyle.
function fakeCtx() {
  const stack: string[] = [];
  const ctx = {
    fillStyle: '#000000',
    canvas: { width: 100, height: 50 },
    save: () => void stack.push(ctx.fillStyle),
    restore: () => void (ctx.fillStyle = stack.pop()!)
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const plug = (id: string, drawExport?: StudioPlugin['drawExport']) =>
  ({ id, name: id, kind: 'studio', apiVersion: 2, dock: 'right', mount: () => {}, drawExport }) as StudioPlugin;

describe('paintPlugins', () => {
  it('calls each plugin with the time, in order, and skips plugins without drawExport', () => {
    const calls: string[] = [];
    const ctx = fakeCtx();
    paintPlugins(
      ctx,
      [plug('a', (_c, t) => void calls.push(`a${t}`)), plug('none'), plug('b', (_c, t) => void calls.push(`b${t}`))],
      42,
      new Set(),
      vi.fn()
    );
    expect(calls).toEqual(['a42', 'b42']);
  });

  it('restores the context even when a plugin throws, reports once and skips it afterwards', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fakeCtx();
    const bad = plug('bad', (c) => {
      c.fillStyle = '#ff00ff';
      throw new Error('boom');
    });
    const good = vi.fn();
    const onError = vi.fn();
    const failed = new Set<string>();

    paintPlugins(ctx, [bad, plug('good', good)], 1, failed, onError);
    paintPlugins(ctx, [bad, plug('good', good)], 2, failed, onError);

    expect(ctx.fillStyle).toBe('#000000');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(bad);
    expect(good).toHaveBeenCalledTimes(2);
  });
});

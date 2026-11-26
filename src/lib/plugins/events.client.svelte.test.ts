import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onChange } from './events.svelte';

// Runs in the client project, where Svelte effects are live.
let frames: Map<number, () => void>;
let next: number;

function flushFrames() {
  const run = [...frames.values()];
  frames.clear();
  run.forEach((f) => f());
}

beforeEach(() => {
  frames = new Map();
  next = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    frames.set(next, cb);
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let value = $state(0);
  const fn = vi.fn();
  const stop = onChange(() => void value, fn);
  flushSync();
  return {
    fn,
    stop,
    set: (v: number) => {
      value = v;
      flushSync();
    }
  };
}

describe('onChange', () => {
  it('is not called for the initial state', () => {
    const { fn, stop } = setup();
    flushFrames();
    expect(fn).not.toHaveBeenCalled();
    stop();
  });

  it('calls once after a change', () => {
    const { fn, set, stop } = setup();
    set(1);
    expect(fn).not.toHaveBeenCalled();
    flushFrames();
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('coalesces changes within one frame', () => {
    const { fn, set, stop } = setup();
    set(1);
    set(2);
    set(3);
    flushFrames();
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop prevents further calls and cancels a pending frame', () => {
    const { fn, set, stop } = setup();
    set(1);
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    set(2);
    flushFrames();
    expect(fn).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import type { Dock } from '#lib/studio/panels';
import { forgetInLayout, hideInLayout, moveInLayout, parseStudioLayout } from './studioLayout';

const defaults: Record<string, Dock> = { a: 'left', b: 'left', c: 'right', d: 'bottom', e: 'bottom' };

describe('parseStudioLayout', () => {
  it('falls back to the defaults', () => {
    expect(parseStudioLayout(null, defaults)).toEqual({
      docks: { left: ['a', 'b'], right: ['c'], bottom: ['d', 'e'] },
      hidden: [],
      sizes: { left: 280, right: 300, bottom: 200, split: 0.5 },
      open: { left: true, right: true, bottom: true },
      tab: null
    });
  });

  it('clamps sizes and drops bad fields', () => {
    const v = parseStudioLayout(
      { sizes: { left: 10, right: 9999, bottom: 'x', split: 0 }, open: { left: 'no', right: false }, tab: 'zzz' },
      defaults
    );
    expect(v.sizes).toEqual({ left: 200, right: 640, bottom: 200, split: 0.2 });
    expect(v.open).toEqual({ left: true, right: false, bottom: true });
    expect(v.tab).toBeNull();
  });

  it('drops unknown and duplicate ids and appends missing ones to their default dock', () => {
    const v = parseStudioLayout(
      { docks: { left: ['c', 'x', 'c', 7], right: ['a'], bottom: ['d'] }, hidden: ['a', 'b', 'nope'], tab: 'd' },
      defaults
    );
    expect(v.docks).toEqual({ left: ['c'], right: ['a'], bottom: ['d', 'e'] });
    expect(v.hidden).toEqual(['b']);
    expect(v.tab).toBe('d');
  });

  it('puts a pinned id stored in another dock back to the end of its default dock', () => {
    const v = parseStudioLayout({ docks: { left: ['a', 'd'], right: ['c'], bottom: ['e'] } }, defaults, ['d']);
    expect(v.docks).toEqual({ left: ['a', 'b'], right: ['c'], bottom: ['e', 'd'] });
  });

  it('keeps a hidden pinned id hidden', () => {
    const v = parseStudioLayout({ docks: { left: ['a', 'b'] }, hidden: ['d'] }, defaults, ['d']);
    expect(v.hidden).toEqual(['d']);
    expect(v.docks.left).toEqual(['a', 'b']);
  });
});

describe('layout moves', () => {
  const base = parseStudioLayout(null, defaults);

  it('moves a panel to another dock, opens it and activates it in the bottom dock', () => {
    const closed = { ...base, open: { ...base.open, bottom: false } };
    const v = moveInLayout(closed, 'a', 'bottom', 1);
    expect(v.docks).toEqual({ left: ['b'], right: ['c'], bottom: ['d', 'a', 'e'] });
    expect(v.open.bottom).toBe(true);
    expect(v.tab).toBe('a');
  });

  it('reorders inside a dock and clamps the index', () => {
    expect(moveInLayout(base, 'a', 'left', 1).docks.left).toEqual(['b', 'a']);
    expect(moveInLayout(base, 'a', 'left', Infinity).docks.left).toEqual(['b', 'a']);
    expect(moveInLayout(base, 'b', 'left', -5).docks.left).toEqual(['b', 'a']);
  });

  it('hides a panel and shows it again at the end of a dock', () => {
    const hidden = hideInLayout(base, 'a');
    expect(hidden.docks.left).toEqual(['b']);
    expect(hidden.hidden).toEqual(['a']);
    const shown = moveInLayout(hidden, 'a', 'left', Infinity);
    expect(shown.docks.left).toEqual(['b', 'a']);
    expect(shown.hidden).toEqual([]);
  });
});

describe('forgetInLayout', () => {
  it('drops a panel from docks, hidden and the bottom tab', () => {
    const v = hideInLayout(parseStudioLayout({ tab: 'e' }, defaults), 'c');
    const next = forgetInLayout(forgetInLayout(v, 'c'), 'e');
    expect(next.hidden).toEqual([]);
    expect(next.docks.bottom).toEqual(['d']);
    expect(next.tab).toBeNull();
  });
});

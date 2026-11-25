import { describe, expect, it } from 'vitest';
import { movePanelIn, parsePageLayout } from './pageLayout';

const defaults = { main: ['a', 'b'], side: ['c', 'd'] };
const parse = (raw: unknown) => parsePageLayout(raw, defaults, ['d']);

describe('parsePageLayout', () => {
  it('uses the defaults for garbage', () => {
    for (const raw of [null, undefined, 5, 'x', [], { columns: 3 }, { columns: { main: 'a' } }]) {
      expect(parse(raw)).toEqual({ columns: defaults, collapsed: ['d'] });
    }
  });

  it('drops unknown and duplicate ids', () => {
    const v = parse({ columns: { main: ['b', 'zzz', 'b', 7], side: ['b', 'a'] }, collapsed: ['a', 'a', 'zzz', 1] });
    expect(v.columns).toEqual({ main: ['b'], side: ['a', 'c', 'd'] });
    expect(v.collapsed).toEqual(['a']);
  });

  it('appends missing ids to their default column', () => {
    expect(parse({ columns: { main: ['c'], side: ['a'] } }).columns).toEqual({ main: ['c', 'b'], side: ['a', 'd'] });
  });

  it('keeps an empty stored collapsed list', () => {
    expect(parse({ collapsed: [] }).collapsed).toEqual([]);
  });
});

describe('movePanelIn', () => {
  const v = parse(null);

  it('reorders inside a column', () => {
    expect(movePanelIn(v, 'a', 'main', 1).columns.main).toEqual(['b', 'a']);
  });

  it('moves between columns and clamps the index', () => {
    expect(movePanelIn(v, 'a', 'side', 1).columns).toEqual({ main: ['b'], side: ['c', 'a', 'd'] });
    expect(movePanelIn(v, 'a', 'side', Infinity).columns.side).toEqual(['c', 'd', 'a']);
    expect(movePanelIn(v, 'd', 'main', -5).columns.main).toEqual(['d', 'a', 'b']);
  });

  it('ignores an unknown column', () => {
    expect(movePanelIn(v, 'a', 'nope', 0)).toBe(v);
  });
});

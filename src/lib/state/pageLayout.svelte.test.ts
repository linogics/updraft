import { describe, expect, it } from 'vitest';
import { PageLayout } from './pageLayout.svelte';

describe('PageLayout', () => {
  it('hides, shows at the end and forgets a panel', () => {
    const l = new PageLayout('t-hide', { main: ['a', 'b', 'c'] }, ['c']);
    l.hide('a');
    expect(l.value.columns.main).toEqual(['b', 'c']);
    expect(l.value.hidden).toEqual(['a']);
    l.show('a');
    expect(l.value.columns.main).toEqual(['b', 'c', 'a']);
    expect(l.value.collapsed).toEqual(['c']);
  });

  it('forgets a hidden panel that is gone', () => {
    const extra = ['x'];
    const l = new PageLayout('t-forget', { main: ['a'] }, [], () => extra);
    l.hide('x');
    l.forget('x');
    extra.length = 0;
    extra.push('x');
    expect(l.value).toMatchObject({ columns: { main: ['a', 'x'] }, hidden: [] });
  });

  it('follows the extra ids and resets', () => {
    let extra = ['x'];
    const l = new PageLayout('t-extra', { main: ['a'] }, [], () => extra);
    expect(l.value.columns.main).toEqual(['a', 'x']);
    l.hide('x');
    extra = [];
    l.reset();
    expect(l.value).toMatchObject({ columns: { main: ['a'] }, hidden: [] });
  });
});

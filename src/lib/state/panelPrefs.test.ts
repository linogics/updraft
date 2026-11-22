import { describe, expect, it } from 'vitest';
import { parsePanelPrefs } from './panelPrefs';

describe('parsePanelPrefs', () => {
  it('falls back to the defaults', () => {
    expect(parsePanelPrefs(null)).toEqual({
      outliner: 280,
      side: 300,
      footer: 200,
      split: 0.5,
      outlinerOpen: true,
      sideOpen: true,
      footerOpen: true
    });
  });

  it('clamps sizes and drops bad fields', () => {
    expect(parsePanelPrefs({ outliner: 10, side: 9999, footer: 'x', split: 0, outlinerOpen: 'no', sideOpen: false, footerOpen: 1 })).toEqual({
      outliner: 200,
      side: 640,
      footer: 200,
      split: 0.2,
      outlinerOpen: true,
      sideOpen: false,
      footerOpen: true
    });
  });
});

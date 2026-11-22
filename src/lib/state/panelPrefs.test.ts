import { describe, expect, it } from 'vitest';
import { parsePanelPrefs } from './panelPrefs';

describe('parsePanelPrefs', () => {
  it('falls back to the defaults', () => {
    expect(parsePanelPrefs(null)).toEqual({ side: 320, footer: 150, split: 0.5, sideOpen: true, footerOpen: true });
  });

  it('clamps sizes and drops bad fields', () => {
    expect(parsePanelPrefs({ side: 9999, footer: 'x', split: 0, sideOpen: false, footerOpen: 1 })).toEqual({
      side: 640,
      footer: 150,
      split: 0.2,
      sideOpen: false,
      footerOpen: true
    });
  });
});

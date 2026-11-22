import { describe, expect, it } from 'vitest';
import { parseThermalOverlayPrefs } from './prefs';

describe('parseThermalOverlayPrefs', () => {
  it('defaults when nothing is stored', () => {
    expect(parseThermalOverlayPrefs(null)).toEqual({ hotspots: false, skyways: false, opacity: 0.6 });
  });

  it('keeps valid fields and clamps opacity', () => {
    expect(parseThermalOverlayPrefs({ hotspots: true, skyways: true, opacity: 5 })).toEqual({ hotspots: true, skyways: true, opacity: 1 });
    expect(parseThermalOverlayPrefs({ hotspots: true, opacity: 0 })).toEqual({ hotspots: true, skyways: false, opacity: 0.1 });
  });

  it('falls back for garbage', () => {
    expect(parseThermalOverlayPrefs({ hotspots: 'yes', skyways: 1, opacity: NaN })).toEqual(parseThermalOverlayPrefs(null));
  });
});

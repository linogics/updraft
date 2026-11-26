import { describe, expect, it } from 'vitest';

import { mp4Filename, pngFilename, slugify } from './filename';

describe('slugify', () => {
  it('lowercases and strips accents', () => {
    expect(slugify('Jürgen Müller')).toBe('jurgen-muller');
  });

  it('collapses punctuation and trims dashes', () => {
    expect(slugify('  Anna  (Lee) / Ops! ')).toBe('anna-lee-ops');
  });

  it('falls back when nothing is left', () => {
    expect(slugify('张伟')).toBe('flight');
  });
});

describe('pngFilename', () => {
  it('builds the export name', () => {
    expect(pngFilename('Max Muster', '2026-07-14', 1080, 1920)).toBe('updraft-max-muster-2026-07-14-1080x1920.png');
  });
});

describe('mp4Filename', () => {
  it('builds the video export name', () => {
    expect(mp4Filename('Max Muster', '2026-07-14', 1920, 1080)).toBe('updraft-max-muster-2026-07-14-1920x1080.mp4');
  });
});

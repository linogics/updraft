import { describe, expect, it } from 'vitest';
import { resampleTerrarium, terrariumHeight } from './terrarium';

/** RGBA pixel encoding a height in Terrarium format. */
function encode(height: number): [number, number, number, number] {
  const v = height + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v - r * 256);
  const b = Math.round((v - Math.floor(v)) * 256);
  return [r, g, b, 255];
}

/** srcSize² tile whose height is given per pixel. */
function tile(srcSize: number, height: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(srcSize * srcSize * 4);
  for (let y = 0; y < srcSize; y++) {
    for (let x = 0; x < srcSize; x++) data.set(encode(height(x, y)), (y * srcSize + x) * 4);
  }

  return data;
}

describe('terrariumHeight', () => {
  it('decodes sea level', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
  });

  it('decodes heights with sub-metre fraction', () => {
    const [r, g, b] = encode(1712.5);
    expect(terrariumHeight(r, g, b)).toBeCloseTo(1712.5, 3);
  });

  it('decodes heights below sea level', () => {
    const [r, g, b] = encode(-420);
    expect(terrariumHeight(r, g, b)).toBe(-420);
  });
});

describe('resampleTerrarium', () => {
  it('returns an outSize² heightmap', () => {
    expect(
      resampleTerrarium(
        tile(4, () => 100),
        4,
        3
      )
    ).toHaveLength(9);
  });

  it('puts corner samples on the edge pixels', () => {
    const src = tile(4, (x, y) => x * 10 + y * 100);
    const out = resampleTerrarium(src, 4, 5);

    expect(out[0]).toBe(0);
    expect(out[4]).toBe(30);
    expect(out[20]).toBe(300);
    expect(out[24]).toBe(330);
  });

  it('interpolates bilinearly between pixels', () => {
    const src = tile(2, (x, y) => x * 10 + y * 100);
    const out = resampleTerrarium(src, 2, 3);

    // Centre sample sits between all four pixels.
    expect(out[4]).toBeCloseTo(55, 6);
  });
});

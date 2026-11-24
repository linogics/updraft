// Decoding of Terrarium elevation tiles (AWS Terrain Tiles / Mapzen), free and keyless.
// Each RGB pixel encodes a height in metres: r*256 + g + b/256 - 32768.

export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Bilinearly resamples a square RGBA Terrarium tile into an outSize² heightmap (row-major,
 * north to south). Corner samples land exactly on the edge pixels, so neighbouring tiles
 * agree within one source pixel along their shared edge.
 */
export function resampleTerrarium(rgba: Uint8ClampedArray, srcSize: number, outSize: number): Float32Array {
  const out = new Float32Array(outSize * outSize);
  const height = (x: number, y: number) => {
    const i = (y * srcSize + x) * 4;
    return terrariumHeight(rgba[i], rgba[i + 1], rgba[i + 2]);
  };

  const scale = (srcSize - 1) / (outSize - 1);

  for (let row = 0; row < outSize; row++) {
    const v = row * scale;
    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, srcSize - 1);
    const fy = v - y0;
    for (let col = 0; col < outSize; col++) {
      const u = col * scale;
      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, srcSize - 1);
      const fx = u - x0;
      const top = height(x0, y0) * (1 - fx) + height(x1, y0) * fx;
      const bottom = height(x0, y1) * (1 - fx) + height(x1, y1) * fx;
      out[row * outSize + col] = top * (1 - fy) + bottom * fy;
    }
  }

  return out;
}

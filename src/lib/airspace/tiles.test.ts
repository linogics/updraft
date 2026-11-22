import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTile } from './tiles';

describe('decodeTile', () => {
  it('decodes airspace polygons of the sample tile (z8/133/90) to lon/lat', () => {
    const buf = readFileSync(new URL('./fixtures/sample.pbf', import.meta.url));
    const features = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 133, 90, 8);
    expect(features.length).toBeGreaterThan(0);
    for (const f of features) {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
      expect(typeof f.properties.source_id).toBe('string');
      const [lon, lat] = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0])[0];
      expect(lon).toBeGreaterThan(5);
      expect(lon).toBeLessThan(11);
      expect(lat).toBeGreaterThan(45);
      expect(lat).toBeLessThan(48.5);
    }
  });
});

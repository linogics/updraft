import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

const dts = `
/** Events of \`WindService.on\`. */
export type WindEvent =
  /** New data arrived. */
  | 'data'
  /** Altitude | changed. */
  | 'altitude';
/** Service \`me/wind@1\`. Provided by the wind plugin. More text. */
export interface WindService {
  on(event: WindEvent, fn: () => void): () => void;
  /** Wind at a point. */
  at(lat: number, lon: number): Wind;
}
/** A wind sample. */
export interface Wind {
  /** m/s. */
  speed: number;
}
`;

it('writes one page per service with events, members and types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svcdocs-'));
  writeFileSync(join(dir, 'wind.d.ts'), dts);
  execFileSync('node', ['scripts/gen-service-docs.mjs', join(dir, 'wind.d.ts'), join(dir, 'out')]);
  const page = readFileSync(join(dir, 'out/me-wind-1.md'), 'utf8');
  expect(page).toContain('# me/wind@1');
  expect(page).toContain('| `data` | New data arrived. |');
  expect(page).toContain('| `altitude` | Altitude \\| changed. |');
  expect(page).toContain('| `at(lat: number, lon: number): Wind` | Wind at a point. |');
  expect(page).toContain('### Wind');
  expect(readFileSync(join(dir, 'out/README.md'), 'utf8')).toContain(
    '- [me/wind@1](me-wind-1.md) Provided by the wind plugin.'
  );
});

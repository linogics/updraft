import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import type { ServiceSchema } from '#lib/plugins/api';

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
/** Kind \`wind-panel\`. A panel with wind. */
export interface WindPlugin extends Base {
  /** Shown to the user. */
  label: string;
  /** Not required. */
  note?: string;
  /** Reads a sample. */
  read(at: number): Wind;
}
/** Fields of every plugin. */
export interface Base {
  /** Plugin id. */
  id: string;
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
  execFileSync('node', ['scripts/gen-plugin-docs.mjs', join(dir, 'wind.d.ts'), join(dir, 'out'), join(dir, 'schemas')]);
  const page = readFileSync(join(dir, 'out/service/reference/me-wind-1.md'), 'utf8');
  expect(page).toContain('# me/wind@1');
  expect(page).toContain('| `data` | New data arrived. |');
  expect(page).toContain('| `altitude` | Altitude \\| changed. |');
  expect(page).toContain('| `at(lat: number, lon: number): Wind` | read | Wind at a point. |');
  expect(page).toContain('### Wind');
  expect(readFileSync(join(dir, 'out/service/reference/README.md'), 'utf8')).toContain(
    '- [me/wind@1](me-wind-1.md) Provided by the wind plugin.'
  );

  const schema = JSON.parse(readFileSync(join(dir, 'schemas/me-wind-1.json'), 'utf8')) as ServiceSchema;
  expect(schema.events).toEqual({
    data: { description: 'New data arrived.' },
    altitude: { description: 'Altitude \\| changed.' }
  });
  expect(schema.methods.at.access).toBe('read');
  expect(schema.methods.at.params[1]).toEqual({ name: 'lon', schema: { type: 'number' } });
  expect(schema.methods.at.returns).toEqual({ $ref: '#/$defs/Wind' });
  expect(schema.$defs.Wind.properties.speed).toEqual({ type: 'number', description: 'm/s.' });

  const kind = readFileSync(join(dir, 'out/wind-panel/api.md'), 'utf8');
  expect(kind).toContain('# `wind-panel` plugin: API reference');
  expect(kind).toContain('| `note?` | `string` | Not required. |');
  expect(kind).toContain('| `label` | `string` | Shown to the user. |');
  expect(kind).toContain('| `read` | `(at: number): Wind` | Reads a sample. |');
  expect(kind).toContain('| `id` | `string` | Plugin id. |');
  expect(kind).toContain('### Wind');
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

const yaml = `
openapi: 3.1.0
info: { title: Demo, version: '1' }
servers: [{ url: /api/demo }]
paths:
  /things/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      operationId: getThing
      summary: Fetch a thing
      responses:
        '200':
          description: The thing.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Thing' }
        '404':
          $ref: '#/components/responses/Missing'
components:
  responses:
    Missing:
      description: Nothing there.
  schemas:
    Thing:
      type: object
      required: [name]
      properties:
        name: { type: string, description: The name. }
        tags: { type: array, items: { type: string } }
        owner: { anyOf: [{ type: string }, { type: 'null' }] }
`;

it('writes operations and schema tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syncdocs-'));
  writeFileSync(join(dir, 'api.yaml'), yaml);
  execFileSync('node', ['scripts/gen-sync-docs.mjs', join(dir, 'api.yaml'), join(dir, 'ref.md')]);

  const page = readFileSync(join(dir, 'ref.md'), 'utf8');
  expect(page).toContain('Do not edit');
  expect(page).toContain('## GET /things/{id}');
  expect(page).toContain('| `id` | path | yes | `string` |  |');
  expect(page).toContain('| 200 | The thing. | `application/json`: [Thing](#thing) |');
  expect(page).toContain('| 404 | Nothing there. | none |');
  expect(page).toContain('| `name` | `string` | yes | The name. |');
  expect(page).toContain('| `tags` | `string`[] | no |  |');
  expect(page).toContain('| `owner` | `string` or `null` | no |  |');
});

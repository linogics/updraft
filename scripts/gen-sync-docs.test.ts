import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

const yaml = `
openapi: 3.1.0
info: { title: Demo, version: '1', description: Global rules here. }
servers: [{ url: /api/demo }]
tags:
  - { name: Things, description: All about things. }
paths:
  /things/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      tags: [Things]
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
      description: A thing. It has a name.
      required: [name]
      example: { name: rock }
      properties:
        name: { type: string, description: The name. }
        tags: { type: array, items: { type: string } }
        owner: { anyOf: [{ type: string }, { type: 'null' }] }
        size: { type: object, properties: { w: { type: number } } }
`;

it('writes collapsible operations and schemas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syncdocs-'));
  writeFileSync(join(dir, 'api.yaml'), yaml);
  execFileSync('node', ['scripts/gen-sync-docs.mjs', join(dir, 'api.yaml'), join(dir, 'ref.md')]);

  const page = readFileSync(join(dir, 'ref.md'), 'utf8');
  expect(page).toContain('Do not edit');
  expect(page).toContain('Global rules here.');
  expect(page).toContain('## Things\n\nAll about things.');
  expect(page).toContain('- [`GET /things/{id}`](#getthing) Fetch a thing');
  expect(page).toContain('<a id="getthing"></a>');
  expect(page).toContain('alt="GET" align="middle" /> <code>/things/{id}</code> Fetch a thing</summary>');
  expect(page).toContain('| `id` | path | yes | `string` |  |');
  expect(page).toContain('| 200 | The thing. | `application/json`: [Thing](#schema-thing) |');
  expect(page).toContain('| 404 | Nothing there. | none |');
  expect(page).toContain('Example `200` body:');
  // One reference is not enough to count as common.
  expect(page).not.toContain('## Common responses');
  expect(page).toContain('<a id="schema-thing"></a>');
  expect(page).toContain('<summary><code>Thing</code> A thing.</summary>\n\nIt has a name.');
  expect(page).toContain('| `name` | `string` | yes | The name. |');
  expect(page).toContain('| `tags` | `string`[] | no |  |');
  expect(page).toContain('| `owner` | `string` or `null` | no |  |');
  expect(page).toContain('| `size.w` | `number` | no |  |');
  expect(page.match(/<details>/g)?.length).toBe(page.match(/<\/details>/g)?.length);
});

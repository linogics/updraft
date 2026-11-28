#!/usr/bin/env node
// Generates the markdown reference of the sync HTTP spec from its OpenAPI file.
//
// Usage: node gen-sync-docs.mjs <openapi.yaml> <reference.md>
import { readFileSync, writeFileSync } from 'node:fs';

import { parse } from 'yaml';

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  console.error('Usage: node gen-sync-docs.mjs <openapi.yaml> <reference.md>');
  process.exit(1);
}

const spec = parse(readFileSync(file, 'utf8'));
const METHODS = ['get', 'put', 'post', 'delete'];
// Swagger UI colors.
const COLORS = { get: 'blue', post: 'green', put: 'orange', delete: 'red' };

const refName = (ref) => ref.split('/').pop();

const resolve = (o) => {
  if (!o?.$ref) return o;
  const target = o.$ref
    .slice(2)
    .split('/')
    .reduce((acc, k) => acc[k], spec);
  // A sibling description overrides the referenced one.
  return { ...target, ...(o.description ? { description: o.description } : {}) };
};

const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

// Prefixed, so a schema never shares an anchor with an operation (SignUp vs signUp).
const anchor = (name) => `schema-${name.toLowerCase()}`;
const json = (v) => ['```json', JSON.stringify(v, null, 2), '```', ''].join('\n');

function typeOf(s) {
  if (!s) return '`any`';

  if (s.$ref) {
    const name = refName(s.$ref);
    return `[${name}](#${anchor(name)})`;
  }

  if (s.anyOf) return s.anyOf.map(typeOf).join(' or ');
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((e) => `\`${JSON.stringify(e)}\``).join(' or ');
  if (s.type === 'array') return `${typeOf(s.items)}[]`;
  return `\`${s.type ?? 'any'}\`${s.format ? ` (${s.format})` : ''}`;
}

function constraints(s) {
  const c = [];
  if (s?.minLength !== undefined) c.push(`min length ${s.minLength}`);
  if (s?.maxLength !== undefined) c.push(`max length ${s.maxLength}`);
  if (s?.minimum !== undefined) c.push(`min ${s.minimum}`);
  if (s?.pattern) c.push(`pattern \`${s.pattern}\``);
  return c.length ? ` (${c.join(', ')})` : '';
}

// Flattens inline objects and inline array items into dotted rows. $refs are linked, not followed.
function rows(s, prefix = '') {
  const required = new Set(s.required ?? []);
  const out = [];
  for (const [name, p] of Object.entries(s.properties ?? {})) {
    const key = prefix + name;
    out.push(
      `| \`${key}\` | ${typeOf(p)}${constraints(p)} | ${required.has(name) ? 'yes' : 'no'} | ${cell(p.description)} |`
    );
    if (p.properties) out.push(...rows(p, `${key}.`));
    else if (p.type === 'array' && p.items?.properties) out.push(...rows(p.items, `${key}[].`));
  }

  return out;
}

function fields(s) {
  const r = rows(s);
  if (!r.length) return '';
  return ['| Field | Type | Required | Description |', '| --- | --- | --- | --- |', ...r, ''].join('\n');
}

const schemaOf = (s) => (s?.$ref ? spec.components.schemas[refName(s.$ref)] : s);

function body(content) {
  return Object.entries(content ?? {})
    .map(([type, c]) => `\`${type}\`: ${typeOf(c.schema)}`)
    .join(', ');
}

const headerList = (r) =>
  Object.entries(r.headers ?? {})
    .map(([name, h]) => `\`${name}\`: ${cell(resolve(h).description)}`)
    .join(' ');

// Which responses are common: a component is common when more than 3 operations reference it with a plain
// $ref. A $ref with its own description is operation specific, so it stays in that operation's table.
const refCount = {};
const plainRef = (r) => (r.$ref && !r.description ? refName(r.$ref) : null);
for (const item of Object.values(spec.paths)) {
  for (const method of METHODS) {
    for (const r of Object.values(item[method]?.responses ?? {})) {
      const name = plainRef(r);
      if (name) refCount[name] = (refCount[name] ?? 0) + 1;
    }
  }
}

const commonName = (r) => {
  const name = plainRef(r);
  return name && refCount[name] > 3 ? name : null;
};

const badge = (m) =>
  `<img src="https://img.shields.io/badge/${m.toUpperCase()}-${COLORS[m]}?style=flat-square" alt="${m.toUpperCase()}" align="middle" />`;

function operation(path, method, op, shared) {
  const lines = [
    `<a id="${op.operationId.toLowerCase()}"></a>`,
    '',
    '<details>',
    '',
    `<summary>${badge(method)} <code>${path}</code> ${op.summary}</summary>`,
    ''
  ];
  if (op.description) lines.push(op.description.trim(), '');
  if (op.security?.length === 0) lines.push('No token needed.', '');

  const params = [...(shared ?? []), ...(op.parameters ?? [])].map(resolve);
  if (params.length) {
    lines.push('| Parameter | In | Required | Type | Description |', '| --- | --- | --- | --- | --- |');
    for (const p of params) {
      const req = p.required ? 'yes' : 'no';
      lines.push(
        `| \`${p.name}\` | ${p.in} | ${req} | ${typeOf(p.schema)}${constraints(p.schema)} | ${cell(p.description)} |`
      );
    }

    lines.push('');
  }

  if (op.requestBody) {
    const rb = resolve(op.requestBody);
    lines.push(`Request body${rb.required ? ' (required)' : ''}: ${body(rb.content)}`, '');
    const ex = schemaOf(rb.content?.['application/json']?.schema)?.example;
    if (ex !== undefined) lines.push(json(ex));
  }

  const own = [];
  const also = [];
  const examples = [];
  for (const [status, raw] of Object.entries(op.responses)) {
    if (commonName(raw)) {
      also.push(status);
      continue;
    }

    const r = resolve(raw);
    const headers = headerList(r);
    const desc = cell(r.description) + (headers ? ` Headers: ${headers}` : '');
    own.push(`| ${status} | ${desc} | ${cell(body(r.content)) || 'none'} |`);

    const schema = r.content?.['application/json']?.schema;
    const ex = schemaOf(schema)?.example;
    const isItem = schema?.$ref && refName(schema.$ref) === 'Item';
    if (ex !== undefined && (status.startsWith('2') || (status === '412' && isItem))) {
      examples.push(`Example \`${status}\` body:`, '', json(ex));
    }
  }

  lines.push('| Status | Description | Body |', '| --- | --- | --- |', ...own, '');
  if (also.length) lines.push(`Also: ${also.join(', ')} (see [Common responses](#common-responses)).`, '');
  lines.push(...examples);
  lines.push('</details>', '');
  return lines.join('\n');
}

const ops = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    if (item[method]) ops.push({ path, method, op: item[method], shared: item.parameters });
  }
}

const parts = [
  '<!-- Generated by scripts/gen-sync-docs.mjs from openapi.yaml. Do not edit. -->',
  '',
  `# ${spec.info.title}, reference`,
  '',
  'Generated from [openapi.yaml](openapi.yaml). The [guide](README.md) explains the reasons.',
  '',
  spec.info.description.trim(),
  '',
  `Paths below are relative to the base path \`${spec.servers[0].url}\`.`,
  ''
];

parts.push('## Index', '');
for (const tag of spec.tags) {
  parts.push(`**${tag.name}**`, '');
  for (const { path, method, op } of ops.filter((o) => o.op.tags.includes(tag.name))) {
    parts.push(`- [\`${method.toUpperCase()} ${path}\`](#${op.operationId.toLowerCase()}) ${op.summary}`);
  }

  parts.push('');
}

const common = new Map();
for (const { op } of ops) {
  for (const [status, raw] of Object.entries(op.responses)) {
    if (commonName(raw)) common.set(status, raw);
  }
}

if (common.size) {
  parts.push(
    '## Common responses',
    '',
    'These answers can come from the operations below. Each operation lists the ones it uses.',
    '',
    '| Status | Description | Headers | Body |',
    '| --- | --- | --- | --- |'
  );

  for (const [status, raw] of [...common].sort(([a], [b]) => a.localeCompare(b))) {
    const r = resolve(raw);
    parts.push(
      `| ${status} | ${cell(r.description)} | ${headerList(r) || 'none'} | ${cell(body(r.content)) || 'none'} |`
    );
  }

  parts.push('');
}

for (const tag of spec.tags) {
  parts.push(`## ${tag.name}`, '', tag.description, '');
  for (const { path, method, op, shared } of ops.filter((o) => o.op.tags.includes(tag.name))) {
    parts.push(operation(path, method, op, shared));
  }
}

parts.push('## Schemas', '');
for (const [name, s] of Object.entries(spec.components.schemas)) {
  const short = (s.description ?? '').trim().split(/(?<=\.)\s/)[0];
  parts.push(
    `<a id="${anchor(name)}"></a>`,
    '',
    '<details>',
    '',
    `<summary><code>${name}</code> ${short}</summary>`,
    ''
  );
  // The first sentence is already in the summary.
  const rest = (s.description ?? '').trim().slice(short.length).trim();
  if (rest) parts.push(rest, '');
  const table = fields(s);
  if (table) {
    parts.push(table);
  } else if (s.additionalProperties?.type) {
    parts.push(`Type: \`object\`, every value is ${typeOf(s.additionalProperties)}.`, '');
  } else {
    parts.push(`Type: ${typeOf(s)}`, '');
  }

  if (s.example !== undefined) parts.push(json(s.example));
  parts.push('</details>', '');
}

writeFileSync(out, parts.join('\n').replace(/\n+$/, '\n'));

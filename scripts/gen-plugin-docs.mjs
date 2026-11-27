#!/usr/bin/env node
// Generates markdown reference pages for plugins from a TSDoc-documented .d.ts file.
//
// Usage: node gen-plugin-docs.mjs <api.d.ts> <outDir> [schemaDir]
// Needs only the `typescript` package, version 6 (npm i -D typescript@6). Version 7 has no JavaScript compiler API. Works for third-party services too.
//
// Rules for the .d.ts:
// - An exported interface whose TSDoc contains Service `vendor/name@major` is a service.
//   Its page is <outDir>/service/reference/vendor-name-major.md.
// - An exported interface whose TSDoc contains Kind `name` is a plugin kind.
//   Its page is <outDir>/<name>/api.md. It lists the members of the interface and of the local interfaces it extends.
// - A service member whose TSDoc has the tag `@write` changes state, every other one only reads.
// - With [schemaDir], every service also gets <schemaDir>/vendor-name-major.json, a `ServiceSchema` (see api.d.ts)
//   that the app uses to check calls. The mapping is syntactic: string literal unions become enums, local interfaces and
//   aliases become $defs, functions become x-kind function and any type from another file becomes x-kind opaque.
// - Every member needs a TSDoc comment, otherwise the generator fails. The `on(event: XEvent, fn)` member is described in the Events table.
// - XEvent is a string-literal union and each member has its own comment, which becomes "when it fires".
// - Exported interfaces and type aliases of the same file that the members use are listed under Types.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import ts from 'typescript';

const [file, outDir, schemaDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('Usage: node gen-plugin-docs.mjs <api.d.ts> <outDir> [schemaDir]');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

const clean = (c) =>
  c
    .replace(/^\s*\/\*\*+|\*+\/\s*$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .replace(/^@write\s*$/m, '')
    .trim();
const isWrite = (n) => !!n.jsDoc?.at(-1)?.tags?.some((t) => t.tagName.text === 'write');
const doc = (n) => (n.jsDoc?.length ? clean(n.jsDoc.at(-1).getText(sf)) : '');
const cell = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
const code = (s) => '`' + cell(s) + '`';
const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`)
  ].join('\n');

const exported = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const decls = sf.statements.filter(
  (n) => (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && exported(n)
);
const byName = new Map(decls.map((d) => [d.name.text, d]));
const serviceOf = (d) => ts.isInterfaceDeclaration(d) && doc(d).match(/Service `([^`]+)`/)?.[1];
const kindOf = (d) => ts.isInterfaceDeclaration(d) && doc(d).match(/Kind `([^`]+)`/)?.[1];
const services = decls.filter(serviceOf);
const kinds = decls.filter(kindOf);

// Own comment of each member of a string-literal union, found between the previous member and this one.
function unionEventsRaw(alias) {
  const members = ts.isUnionTypeNode(alias.type) ? alias.type.types : [alias.type];
  let prev = alias.type.pos;
  return members.map((m) => {
    const comments = [...text.slice(prev, m.getStart(sf)).matchAll(/\/\*\*[\s\S]*?\*\//g)];
    prev = m.end;
    return [m.literal?.text ?? m.getText(sf), comments.length ? clean(comments.at(-1)[0]) : ''];
  });
}

const unionEvents = (alias) => unionEventsRaw(alias).map(([n, d]) => [code(n), cell(d)]);

// Maps a type node to a JSON Schema. Local types are collected in `defs` and referenced.
function schemaOfType(node, defs) {
  const k = ts.SyntaxKind;
  const S = (n) => schemaOfType(n, defs);
  switch (node.kind) {
    case k.ParenthesizedType:
      return S(node.type);
    case k.StringKeyword:
      return { type: 'string' };
    case k.NumberKeyword:
      return { type: 'number' };
    case k.BooleanKeyword:
      return { type: 'boolean' };
    case k.VoidKeyword:
    case k.UndefinedKeyword:
      return { 'x-kind': 'void' };
    case k.ObjectKeyword:
      return { type: 'object' };
    case k.UnknownKeyword:
    case k.AnyKeyword:
      return {};

    case k.LiteralType: {
      const l = node.literal;
      if (l.kind === k.NullKeyword) return { type: 'null' };
      if (l.kind === k.TrueKeyword) return { const: true };
      if (l.kind === k.FalseKeyword) return { const: false };
      return { const: ts.isStringLiteral(l) ? l.text : Number(l.text) };
    }

    case k.UnionType: {
      const members = node.types.filter((t) => t.kind !== k.UndefinedKeyword);
      if (members.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))) {
        return { type: 'string', enum: members.map((t) => t.literal.text) };
      }

      const parts = members.map(S);
      return parts.length === 1 ? parts[0] : { anyOf: parts };
    }

    case k.ArrayType:
      return { type: 'array', items: S(node.elementType) };
    case k.TypeOperator:
      return S(node.type);
    case k.TypeLiteral:
      return objectSchema(node.members, defs);
    case k.FunctionType:
      return { 'x-kind': 'function' };

    case k.TypeReference: {
      const name = node.typeName.getText(sf);
      const args = node.typeArguments ?? [];
      if (name === 'Readonly') return S(args[0]);
      if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array', items: S(args[0]) };

      if (name === 'Record') {
        const key = args[0];
        const lits = ts.isUnionTypeNode(key) ? key.types : [key];
        if (lits.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))) {
          const names = lits.map((t) => t.literal.text);
          return { type: 'object', properties: Object.fromEntries(names.map((n) => [n, S(args[1])])), required: names };
        }

        return { type: 'object', additionalProperties: S(args[1]) };
      }

      const decl = byName.get(name);
      if (decl && !serviceOf(decl)) {
        if (!defs[name]) {
          defs[name] = {};
          defs[name] = defOf(decl, defs);
        }

        return { $ref: `#/$defs/${name}` };
      }

      return { 'x-kind': 'opaque' };
    }

    default:
      return { 'x-kind': 'opaque' };
  }
}

function objectSchema(members, defs) {
  const properties = {};
  const required = [];
  for (const m of members) {
    if (!m.name) continue;
    const base = ts.isMethodSignature(m) ? { 'x-kind': 'function' } : schemaOfType(m.type, defs);
    const d = doc(m);
    properties[memberName(m)] = d ? { ...base, description: d } : base;
    if (!m.questionToken) required.push(memberName(m));
  }

  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function defOf(decl, defs) {
  let s;
  if (ts.isTypeAliasDeclaration(decl)) {
    s = schemaOfType(decl.type, defs);
  } else {
    const bases = (decl.heritageClauses ?? []).flatMap((h) => h.types).map((t) => byName.get(t.expression.getText(sf)));
    const own = objectSchema(decl.members, defs);
    const parts = bases.filter(Boolean).map((b) => defOf(b, defs));
    s = { ...own };
    s.properties = Object.assign({}, ...parts.map((p) => p.properties), own.properties);
    const required = [...parts.flatMap((p) => p.required ?? []), ...(own.required ?? [])];
    if (required.length) s.required = required;
  }

  const d = doc(decl);
  return d ? { description: d, ...s } : s;
}

// The ServiceSchema of a service interface. `on` is described by `events`.
function serviceSchema(svc, name, on, eventAlias) {
  const defs = {};
  const methods = {};
  for (const m of svc.members.filter((x) => x.name && x !== on)) {
    methods[memberName(m)] = {
      description: cell(doc(m)),
      access: isWrite(m) ? 'write' : 'read',
      params: m.parameters.map((p) => ({
        name: p.name.getText(sf),
        ...(p.questionToken ? { optional: true } : {}),
        schema: schemaOfType(p.type, defs)
      })),
      returns: schemaOfType(m.type, defs)
    };
  }

  const out = {
    name,
    description: doc(svc)
      .replace(/^Service `[^`]+`\.?\s*/, '')
      .replace(/\s*\n\s*/g, ' '),
    methods
  };

  if (eventAlias) {
    out.events = Object.fromEntries(unionEventsRaw(eventAlias).map(([n, d]) => [n, { description: cell(d) }]));
  }

  if (Object.keys(defs).length) out.$defs = defs;
  return out;
}

// Names of local exported types used inside a node, followed transitively, in source order.
function referenced(nodes, skip) {
  const seen = new Set();
  const visit = (n) => {
    if (ts.isTypeReferenceNode(n) && byName.has(n.typeName.getText(sf))) {
      const name = n.typeName.getText(sf);
      if (!seen.has(name) && !skip.has(name)) {
        seen.add(name);
        visit(byName.get(name));
      }
    }

    ts.forEachChild(n, visit);
  };

  nodes.forEach(visit);
  return decls.filter((d) => seen.has(d.name.text));
}

const memberName = (m) => m.name.getText(sf);
const memberType = (m) =>
  m.type && !ts.isMethodSignature(m)
    ? m.type.getText(sf)
    : m.getText(sf).replace(/;$/, '').replace(memberName(m), '').trim();

// The members of an interface as table rows. A member without a TSDoc comment is an error.
function fieldRows(owner, members) {
  return members.map((m) => {
    if (!doc(m)) {
      console.error(`${owner}.${memberName(m)} has no TSDoc comment.`);
      process.exit(1);
    }

    return [code(memberName(m) + (m.questionToken ? '?' : '')), code(memberType(m)), cell(doc(m))];
  });
}

function typeSection(d) {
  const intro = [`### ${d.name.text}`, doc(d)];
  if (ts.isTypeAliasDeclaration(d)) {
    return [...intro, '```ts\n' + d.getText(sf).replace(/^export /, '') + '\n```'].filter(Boolean).join('\n\n');
  }

  const rows = fieldRows(d.name.text, d.members);
  return [...intro, table(['Field', 'Type', 'Description'], rows)].filter(Boolean).join('\n\n');
}

// Own members first, then those of extended local interfaces unless overridden.
function kindMembers(d, seen = new Set()) {
  const own = d.members.filter((m) => m.name);
  const names = new Set([...seen, ...own.map(memberName)]);
  const bases = (d.heritageClauses ?? []).flatMap((h) => h.types).map((t) => byName.get(t.expression.getText(sf)));
  return [
    ...own.filter((m) => !seen.has(memberName(m))),
    ...bases.filter(Boolean).flatMap((b) => kindMembers(b, names))
  ];
}

mkdirSync(outDir, { recursive: true });
const index = [];
const svcDir = join(outDir, 'service', 'reference');
mkdirSync(svcDir, { recursive: true });
for (const svc of services) {
  const name = serviceOf(svc);
  const slug = name.replace(/[/@]/g, '-');
  const members = svc.members.filter((m) => m.name);
  const on = members.find((m) => m.name.getText(sf) === 'on');
  const eventName = on?.parameters[0]?.type?.getText(sf);
  const eventAlias = eventName && byName.get(eventName);
  const skip = new Set(services.map((s) => s.name.text).concat(eventName ?? []));

  const out = [`# ${name}`, doc(svc)];
  if (eventAlias) {
    out.push(
      '## Events',
      `Subscribe with ${code(on.getText(sf).replace(/;$/, ''))}.`,
      table(['Event', 'When it fires'], unionEvents(eventAlias))
    );
  }

  const rows = members
    .filter((m) => m !== on)
    .map((m) => [code(m.getText(sf).replace(/;$/, '')), isWrite(m) ? 'write' : 'read', cell(doc(m))]);
  out.push(
    '## Members',
    'Methods marked `write` change state, the others only read.',
    table(['Member', 'Access', 'Description'], rows)
  );
  const types = referenced(
    members.filter((m) => m !== on),
    skip
  );
  if (types.length) out.push('## Types', ...types.map(typeSection));
  writeFileSync(join(svcDir, `${slug}.md`), out.join('\n\n') + '\n');
  if (schemaDir) {
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(
      join(schemaDir, `${slug}.json`),
      JSON.stringify(serviceSchema(svc, name, on, eventAlias), null, 2) + '\n'
    );
  }

  const first =
    doc(svc)
      .split(/Service `[^`]+`\.?/)[1]
      ?.trim()
      .match(/^[\s\S]*?\.(?=\s|$)/)?.[0] ?? '';
  index.push(`- [${name}](${slug}.md) ${first.replace(/\s+/g, ' ')}`.trimEnd());
}

writeFileSync(join(svcDir, 'README.md'), `# Services\n\n${index.join('\n')}\n`);

for (const k of kinds) {
  const name = kindOf(k);
  const members = kindMembers(k);
  const skip = new Set(kinds.concat(services).map((d) => d.name.text));
  const out = [
    `# \`${name}\` plugin: API reference`,
    `Generated from \`${basename(file)}\`, do not edit.`,
    doc(k).replace(/Kind `[^`]+`\.?\s*/, ''),
    '## Members',
    table(['Field', 'Type', 'Description'], fieldRows(k.name.text, members))
  ];
  const types = referenced(members, skip);
  if (types.length) out.push('## Types', ...types.map(typeSection));
  mkdirSync(join(outDir, name), { recursive: true });
  writeFileSync(join(outDir, name, 'api.md'), out.filter(Boolean).join('\n\n') + '\n');
}

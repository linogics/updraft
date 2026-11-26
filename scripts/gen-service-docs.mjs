#!/usr/bin/env node
// Generates one markdown reference page per plugin service from a TSDoc-documented .d.ts file.
//
// Usage: node gen-service-docs.mjs <api.d.ts> <outDir>
// Needs only the `typescript` package, version 6 (npm i -D typescript@6). Version 7 has no JavaScript compiler API. Works for third-party services too.
//
// Rules for the .d.ts:
// - An exported interface whose TSDoc contains Service `vendor/name@major` is a service.
//   Its page is <outDir>/vendor-name-major.md.
// - Every member needs a TSDoc comment. The `on(event: XEvent, fn)` member is described in the Events table.
// - XEvent is a string-literal union and each member has its own comment, which becomes "when it fires".
// - Exported interfaces and type aliases of the same file that the members use are listed under Types.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('Usage: node gen-service-docs.mjs <api.d.ts> <outDir>');
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
    .trim();
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
const services = decls.filter(serviceOf);

// Own comment of each member of a string-literal union, found between the previous member and this one.
function unionEvents(alias) {
  const members = ts.isUnionTypeNode(alias.type) ? alias.type.types : [alias.type];
  let prev = alias.type.pos;
  return members.map((m) => {
    const comments = [...text.slice(prev, m.getStart(sf)).matchAll(/\/\*\*[\s\S]*?\*\//g)];
    prev = m.end;
    return [code(m.literal?.text ?? m.getText(sf)), cell(comments.length ? clean(comments.at(-1)[0]) : '')];
  });
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

function typeSection(d) {
  const intro = [`### ${d.name.text}`, doc(d)];
  if (ts.isTypeAliasDeclaration(d)) {
    return [...intro, '```ts\n' + d.getText(sf).replace(/^export /, '') + '\n```'].filter(Boolean).join('\n\n');
  }

  const rows = d.members.map((m) => [code(m.name.getText(sf)), code(m.type?.getText(sf) ?? ''), cell(doc(m))]);
  return [...intro, table(['Field', 'Type', 'Description'], rows)].filter(Boolean).join('\n\n');
}

mkdirSync(outDir, { recursive: true });
const index = [];
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

  const rows = members.filter((m) => m !== on).map((m) => [code(m.getText(sf).replace(/;$/, '')), cell(doc(m))]);
  out.push('## Members', table(['Member', 'Description'], rows));
  const types = referenced(
    members.filter((m) => m !== on),
    skip
  );
  if (types.length) out.push('## Types', ...types.map(typeSection));
  writeFileSync(join(outDir, `${slug}.md`), out.join('\n\n') + '\n');

  const first =
    doc(svc)
      .split(/Service `[^`]+`\.?/)[1]
      ?.trim()
      .match(/^[\s\S]*?\.(?=\s|$)/)?.[0] ?? '';
  index.push(`- [${name}](${slug}.md) ${first.replace(/\s+/g, ' ')}`.trimEnd());
}

writeFileSync(join(outDir, 'README.md'), `# Services\n\n${index.join('\n')}\n`);

import { expect, it } from 'vitest';

import { coreSchemas } from './coreSchemas';
import { typeText } from './typeText';

it('renders readable types', () => {
  expect(
    typeText({
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, visible: { type: 'boolean' } }, required: ['id'] }
    })
  ).toBe('{ id: string; visible?: boolean }[]');
  expect(typeText({ anyOf: [{ $ref: '#/$defs/Wind' }, { type: 'null' }] })).toBe('Wind | null');
  expect(typeText({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } })).toBe('("a" | "b")[]');
  expect(typeText({ 'x-kind': 'void' })).toBe('void');
  expect(typeText({ 'x-kind': 'promise', resolves: { type: 'array', items: { type: 'string' } } })).toBe(
    'Promise<string[]>'
  );
  expect(typeText({})).toBe('unknown');
});

it('renders every core method', () => {
  for (const s of coreSchemas) for (const m of Object.values(s.methods)) expect(typeText(m.returns)).not.toBe('');
});

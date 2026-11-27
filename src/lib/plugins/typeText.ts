import type { JsonSchema } from './api';

const LIST = ['string', 'number', 'integer', 'boolean', 'null'];

/** A short readable type for a schema, for example `{ id: string; visible: boolean }[]`. `$ref` shows its name. */
export function typeText(schema: JsonSchema): string {
  if (schema.$ref !== undefined) return schema.$ref.replace('#/$defs/', '');

  const kind = schema['x-kind'];
  if (kind === 'function') return 'function';
  if (kind === 'opaque') return 'opaque';
  if (kind === 'void') return 'void';

  if (schema.anyOf) return schema.anyOf.map(typeText).join(' | ');
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((e) => JSON.stringify(e)).join(' | ');

  if (schema.type === 'array') {
    const item = schema.items ? typeText(schema.items) : 'unknown';
    return /[ |]/.test(item) && !item.startsWith('{') ? `(${item})[]` : `${item}[]`;
  }

  if (schema.type === 'object') {
    const props = Object.entries(schema.properties ?? {}).map(
      ([k, v]) => `${k}${schema.required?.includes(k) ? '' : '?'}: ${typeText(v)}`
    );

    if (typeof schema.additionalProperties === 'object') {
      props.push(`[key: string]: ${typeText(schema.additionalProperties)}`);
    }

    return props.length ? `{ ${props.join('; ')} }` : 'object';
  }

  return schema.type && LIST.includes(schema.type) ? schema.type : 'unknown';
}

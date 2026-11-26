import { readFit } from '#lib/domain/formats/fit';

import type { ConverterPlugin } from '../../converterKind';

export default {
  id: 'updraft/fit',
  name: 'FIT',
  kind: 'converter',
  apiVersion: 1,
  label: 'FIT',
  extensions: ['fit'],
  read: async (f) => readFit(await f.arrayBuffer(), f.name)
} satisfies ConverterPlugin;

import { readIgc, writeIgc } from '#lib/domain/formats/igc';

import type { ConverterPlugin } from '../../converterKind';
import { asFlight, readText } from './shared';

export default {
  id: 'updraft/igc',
  name: 'IGC',
  kind: 'converter',
  apiVersion: 1,
  label: 'IGC',
  extensions: ['igc'],
  mime: 'application/octet-stream',
  read: readText(readIgc),
  write: (t) => writeIgc(asFlight(t))
} satisfies ConverterPlugin;

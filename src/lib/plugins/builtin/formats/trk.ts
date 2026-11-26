import { readTrk } from '#lib/domain/formats/trk';

import type { ConverterPlugin } from '../../converterKind';
import { readText } from './shared';

export default {
  id: 'updraft/trk',
  name: 'TRK',
  kind: 'converter',
  apiVersion: 1,
  label: 'TRK',
  extensions: ['trk'],
  read: readText(readTrk)
} satisfies ConverterPlugin;

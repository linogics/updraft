import { readGpx, writeGpx } from '#lib/domain/formats/gpx';

import type { ConverterPlugin } from '../../converterKind';
import { asFlight, readText } from './shared';

export default {
  id: 'updraft/gpx',
  name: 'GPX',
  kind: 'converter',
  apiVersion: 1,
  label: 'GPX',
  extensions: ['gpx'],
  mime: 'application/gpx+xml',
  read: readText(readGpx),
  write: (t) => writeGpx(asFlight(t))
} satisfies ConverterPlugin;

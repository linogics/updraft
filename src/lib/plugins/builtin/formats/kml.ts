import { readKml, writeKml } from '#lib/domain/formats/kml';

import type { ConverterPlugin } from '../../converterKind';
import { asFlight, readText } from './shared';

export default {
  id: 'updraft/kml',
  name: 'KML',
  kind: 'converter',
  apiVersion: 1,
  label: 'KML',
  extensions: ['kml'],
  mime: 'application/vnd.google-earth.kml+xml',
  read: readText(readKml),
  write: (t) => writeKml(asFlight(t))
} satisfies ConverterPlugin;

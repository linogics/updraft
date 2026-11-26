import { readGeoJson, writeGeoJson } from '#lib/domain/formats/geojson';

import type { ConverterPlugin } from '../../converterKind';
import { asFlight, readText } from './shared';

export default {
  id: 'updraft/geojson',
  name: 'GeoJSON',
  kind: 'converter',
  apiVersion: 1,
  label: 'GeoJSON',
  extensions: ['geojson', 'json'],
  mime: 'application/geo+json',
  read: readText(readGeoJson),
  write: (t) => writeGeoJson(asFlight(t))
} satisfies ConverterPlugin;

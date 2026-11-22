import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, FilterSpecification, VectorTileSource } from 'maplibre-gl';
import type { Units } from '#lib/ui/units';
import { AIRSPACE_CLASSES, airspaceLabel, CLASS_COLORS } from './model';
import type { AirspacePrefsValue } from './prefs';
import { TILE_URL } from './tiles';

const SOURCE = 'airspaces';
export const FILL = 'airspaces-fill';
const LINE = 'airspaces-line';

const cls: ExpressionSpecification = ['get', 'icao_class'];
const letters = AIRSPACE_CLASSES.filter((c) => c !== 'other').map((c) => c.toLowerCase());

const colorExpr = [
  'match',
  cls,
  ...letters.flatMap((l) => [l, CLASS_COLORS[l.toUpperCase() as keyof typeof CLASS_COLORS]]),
  CLASS_COLORS.other
] as ExpressionSpecification;

function filter(p: AirspacePrefsValue): FilterSpecification {
  const num = (name: string): ExpressionSpecification => ['to-number', ['get', name], 0];
  // Floor in metres, GND counts as 0. Unknown units are treated as metres like the model does.
  const floor: ExpressionSpecification = [
    'case',
    ['==', ['get', 'lower_limit_reference_datum'], 'GND'],
    0,
    ['==', ['get', 'lower_limit_unit'], 'FL'],
    ['*', num('lower_limit_value'), 30.48],
    ['==', ['get', 'lower_limit_unit'], 'FT'],
    ['*', num('lower_limit_value'), 0.3048],
    num('lower_limit_value')
  ];
  const shown = p.classes.filter((c) => c !== 'other').map((c) => c.toLowerCase());
  const hidden = letters.filter((l) => !shown.includes(l));
  const classes: ExpressionSpecification = p.classes.includes('other')
    ? ['!', ['in', cls, ['literal', hidden]]]
    : ['in', cls, ['literal', shown]];
  return ['all', classes, ['<=', floor, p.maxFloor]];
}

/**
 * Adds, updates or removes the airspace layers to match the prefs. Safe to call on every change.
 * `before` keeps the flight layers above the airspaces.
 */
export function syncAirspaces(map: maplibregl.Map, p: AirspacePrefsValue, key: string, before: string) {
  const tiles = `${TILE_URL}?apiKey=${encodeURIComponent(key)}`;
  if (!p.show || !key) {
    for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    return;
  }
  const src = map.getSource(SOURCE) as VectorTileSource | undefined;
  if (!src) {
    map.addSource(SOURCE, { type: 'vector', tiles: [tiles], minzoom: 0, maxzoom: 14, attribution: '© openAIP' });
    map.addLayer({ id: FILL, type: 'fill', source: SOURCE, 'source-layer': 'airspaces', paint: {} }, before);
    map.addLayer(
      { id: LINE, type: 'line', source: SOURCE, 'source-layer': 'airspaces', paint: { 'line-width': 1 } },
      before
    );
  } else if (src.tiles?.[0] !== tiles) src.setTiles([tiles]);
  const f = filter(p);
  map.setFilter(FILL, f);
  map.setFilter(LINE, f);
  map.setPaintProperty(FILL, 'fill-color', colorExpr);
  map.setPaintProperty(FILL, 'fill-opacity', p.opacity);
  map.setPaintProperty(LINE, 'line-color', colorExpr);
  map.setPaintProperty(LINE, 'line-opacity', Math.min(1, p.opacity * 3));
}

/** Click shows every airspace under the point. Pieces cut by tile edges share a source_id and appear once. */
export function bindAirspacePopup(map: maplibregl.Map, units: () => Units) {
  map.on('click', (e) => {
    if (!map.getLayer(FILL)) return;
    const seen = new Set<unknown>();
    const lines: string[] = [];
    for (const f of map.queryRenderedFeatures(e.point, { layers: [FILL] })) {
      const id = f.properties.source_id ?? f.properties.name;
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(airspaceLabel(f.properties, units()));
    }
    if (!lines.length) return;
    const el = document.createElement('div');
    for (const l of lines) el.append(Object.assign(document.createElement('div'), { textContent: l }));
    new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
  });
}

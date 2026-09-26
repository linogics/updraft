import type { BasemapId } from '#lib/domain/scene';

// Free, keyless map sources shared by the 3D (Cesium) and 2D (MapLibre) views.
// All require attribution. Fine for low traffic; heavy use should self-host or use a keyed provider.

export interface Basemap {
  label: string;
  /** XYZ templates with {z}/{x}/{y}; several entries spread load over subdomains. */
  tiles: string[];
  maxZoom: number;
  attribution: string;
}

export const BASEMAPS: Record<BasemapId, Basemap> = {
  satellite: {
    label: 'Satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
  },
  topo: {
    label: 'Topo',
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    maxZoom: 17,
    attribution: '© OpenStreetMap contributors, SRTM · style © OpenTopoMap (CC-BY-SA)'
  },
  osm: {
    label: 'OSM',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }
};

/** AWS Terrain Tiles (Mapzen) in Terrarium encoding: global elevation, metres MSL, z0–15. */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRARIUM_MAX_ZOOM = 15;
export const TERRARIUM_ATTRIBUTION = 'Terrain: Mapzen, AWS Terrain Tiles';

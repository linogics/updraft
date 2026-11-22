import './setup';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { BasemapId, TerrainSource } from '#lib/domain/scene';
import { BASEMAPS } from '#lib/map/basemaps';
import { createTerrainProvider, SAMPLE_LEVEL } from './terrain';

const WIDGETS_OFF = {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: false
} as const;

function basemapLayer(id: BasemapId): Cesium.ImageryLayer {
  const { tiles, maxZoom, attribution } = BASEMAPS[id];
  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: tiles[0],
      maximumLevel: maxZoom,
      credit: new Cesium.Credit(attribution)
    })
  );
}

/** Creates the 3D viewer with the given base imagery and a flat globe; call setTerrain afterwards. */
export function createViewer(container: HTMLElement, basemap: BasemapId, ionToken: string): Cesium.Viewer {
  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;
  const viewer = new Cesium.Viewer(container, { ...WIDGETS_OFF, baseLayer: basemapLayer(basemap) });
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.enableLighting = false;
  return viewer;
}

/** Replaces the base imagery layer. */
export function setBasemap(viewer: Cesium.Viewer, id: BasemapId) {
  const layers = viewer.imageryLayers;
  const old = layers.get(0);
  layers.add(basemapLayer(id), 0);
  if (old) layers.remove(old, true);
}

/**
 * Loads a terrain source into the viewer. If ion fails (bad token, network), falls back to
 * the free Terrarium tiles. Resolves with the source actually in use.
 */
export async function setTerrain(viewer: Cesium.Viewer, source: TerrainSource): Promise<TerrainSource> {
  try {
    viewer.terrainProvider = await createTerrainProvider(source);
    return source;
  } catch (err) {
    if (source !== 'ion') throw err;
    console.warn('Cesium ion terrain unavailable, falling back to AWS Terrain Tiles', err);
    viewer.terrainProvider = await createTerrainProvider('terrarium');
    return 'terrarium';
  }
}

/** Terrain height at a point for the given source, or undefined when unavailable. */
export async function sampleGroundHeight(
  viewer: Cesium.Viewer,
  source: TerrainSource,
  lat: number,
  lon: number
): Promise<number | undefined> {
  if (source === 'none') return undefined;
  const points = [Cesium.Cartographic.fromDegrees(lon, lat)];
  try {
    // The custom Terrarium provider has no availability tree, so query a fixed level.
    const [p] =
      source === 'ion'
        ? await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, points)
        : await Cesium.sampleTerrain(viewer.terrainProvider, SAMPLE_LEVEL, points);
    return Number.isFinite(p.height) ? p.height : undefined;
  } catch {
    return undefined;
  }
}

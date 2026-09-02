import './setup';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export interface ViewerHandle {
  viewer: Cesium.Viewer;
  /** True when real terrain is loaded (needs a Cesium ion token). */
  hasTerrain: boolean;
}

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

/** Creates the 3D viewer: ion terrain + imagery with a token, flat OSM globe without. */
export async function createViewer(container: HTMLElement, ionToken: string): Promise<ViewerHandle> {
  let viewer: Cesium.Viewer;
  let hasTerrain = false;

  if (ionToken) {
    Cesium.Ion.defaultAccessToken = ionToken;
    try {
      const terrainProvider = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true });
      viewer = new Cesium.Viewer(container, {
        ...WIDGETS_OFF,
        terrainProvider,
        baseLayer: Cesium.ImageryLayer.fromWorldImagery({})
      });
      hasTerrain = true;
    } catch (err) {
      console.warn('Cesium ion unavailable, falling back to OpenStreetMap', err);
      viewer = osmViewer(container);
    }
  } else {
    viewer = osmViewer(container);
  }

  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.enableLighting = false;
  return { viewer, hasTerrain };
}

function osmViewer(container: HTMLElement): Cesium.Viewer {
  return new Cesium.Viewer(container, {
    ...WIDGETS_OFF,
    baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }))
  });
}

/** Terrain height at a point, or undefined when unavailable. */
export async function sampleGroundHeight(viewer: Cesium.Viewer, lat: number, lon: number): Promise<number | undefined> {
  try {
    const [p] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [Cesium.Cartographic.fromDegrees(lon, lat)]);
    return Number.isFinite(p.height) ? p.height : undefined;
  } catch {
    return undefined;
  }
}

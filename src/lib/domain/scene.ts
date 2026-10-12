// Serialisable replay scene. Lives in the URL today; becomes a shareable server-side scene later.

import { DEFAULT_FILTER, type ThermalFilter } from './analysis/filter';
import { SYNC_MODES, type SyncMode } from './sync';

export const CAMERA_MODES = ['follow', 'cockpit', 'orbit', 'free'] as const;
export const COLOR_MODES = ['vario', 'phase', 'climb', 'pilot'] as const;
export const LAYOUTS = ['3d', '2d', 'split'] as const;
export const BASEMAP_IDS = ['satellite', 'topo', 'osm'] as const;
export const TERRAIN_SOURCES = ['ion', 'terrarium', 'none'] as const;
export const TRACK_STYLES = ['solid', 'outline', 'curtain', 'glow'] as const;
export const TRACK_WIDTH = { min: 1, max: 10 } as const;

export type CameraMode = (typeof CAMERA_MODES)[number];
export type ColorMode = (typeof COLOR_MODES)[number];
export type Layout = (typeof LAYOUTS)[number];
export type BasemapId = (typeof BASEMAP_IDS)[number];
export type TerrainSource = (typeof TERRAIN_SOURCES)[number];
export type TrackStyle = (typeof TRACK_STYLES)[number];

export interface SceneConfig {
  flightIds: string[];
  camera: CameraMode;
  colorBy: ColorMode;
  layout: Layout;
  basemap: BasemapId;
  /** null: pick the best available source (see resolveTerrain). */
  terrain: TerrainSource | null;
  /** null: pick from the flight dates (see defaultSyncMode). */
  sync: SyncMode | null;
  /** Manual time shift per flight id, ms. */
  nudges: Record<string, number>;
  thermalFilter: ThermalFilter;
  trackStyle: TrackStyle;
  /** Track line width, px. */
  trackWidth: number;
  /** Pilot colour overrides per flight id, '#rrggbb'. */
  colors: Record<string, string>;
}

export const DEFAULT_SCENE: SceneConfig = {
  flightIds: [],
  camera: 'follow',
  colorBy: 'vario',
  layout: '3d',
  basemap: 'satellite',
  terrain: null,
  sync: null,
  nudges: {},
  thermalFilter: DEFAULT_FILTER,
  trackStyle: 'solid',
  trackWidth: 3,
  colors: {}
};

function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T;
function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: null): T | null;
function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: T | null): T | null {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function encodeScene(scene: SceneConfig): string {
  const params = new URLSearchParams();
  for (const id of scene.flightIds) params.append('f', id);
  params.set('camera', scene.camera);
  params.set('color', scene.colorBy);
  params.set('layout', scene.layout);
  params.set('map', scene.basemap);
  if (scene.terrain) params.set('terrain', scene.terrain);
  if (scene.sync) params.set('sync', scene.sync);
  for (const [id, ms] of Object.entries(scene.nudges)) {
    const seconds = Math.round(ms / 1000);
    if (seconds !== 0) params.append('nudge', `${id}:${seconds}`);
  }
  const { minGain, minClimb } = scene.thermalFilter;
  if (minGain !== DEFAULT_FILTER.minGain) params.set('tgain', String(minGain));
  if (minClimb !== DEFAULT_FILTER.minClimb) params.set('tclimb', String(minClimb));
  if (scene.trackStyle !== DEFAULT_SCENE.trackStyle) params.set('style', scene.trackStyle);
  if (scene.trackWidth !== DEFAULT_SCENE.trackWidth) params.set('width', String(scene.trackWidth));
  for (const [id, hex] of Object.entries(scene.colors)) params.append('pc', `${id}:${hex}`);
  return params.toString();
}

function decodeNudges(values: string[]): Record<string, number> {
  const nudges: Record<string, number> = {};
  for (const value of values) {
    const sep = value.lastIndexOf(':');
    if (sep <= 0) continue;
    const seconds = Number(value.slice(sep + 1));
    if (Number.isFinite(seconds) && seconds !== 0) nudges[value.slice(0, sep)] = seconds * 1000;
  }
  return nudges;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function decodeColors(values: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const value of values) {
    const sep = value.lastIndexOf(':');
    const hex = value.slice(sep + 1);
    if (sep > 0 && HEX_COLOR.test(hex)) colors[value.slice(0, sep)] = hex.toLowerCase();
  }
  return colors;
}

function width(value: string | null): number {
  const n = Math.round(Number(value));
  if (value === null || !Number.isFinite(n)) return DEFAULT_SCENE.trackWidth;
  return Math.min(TRACK_WIDTH.max, Math.max(TRACK_WIDTH.min, n));
}

/** Non-negative finite number, else the fallback. */
function threshold(value: string | null, fallback: number): number {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function decodeScene(params: Pick<URLSearchParams, 'get' | 'getAll'>): SceneConfig {
  return {
    flightIds: params.getAll('f'),
    camera: pick(CAMERA_MODES, params.get('camera'), DEFAULT_SCENE.camera),
    colorBy: pick(COLOR_MODES, params.get('color'), DEFAULT_SCENE.colorBy),
    layout: pick(LAYOUTS, params.get('layout'), DEFAULT_SCENE.layout),
    basemap: pick(BASEMAP_IDS, params.get('map'), DEFAULT_SCENE.basemap),
    terrain: pick(TERRAIN_SOURCES, params.get('terrain'), null),
    sync: pick(SYNC_MODES, params.get('sync'), null),
    nudges: decodeNudges(params.getAll('nudge')),
    thermalFilter: {
      minGain: threshold(params.get('tgain'), DEFAULT_FILTER.minGain),
      minClimb: threshold(params.get('tclimb'), DEFAULT_FILTER.minClimb)
    },
    trackStyle: pick(TRACK_STYLES, params.get('style'), DEFAULT_SCENE.trackStyle),
    trackWidth: width(params.get('width')),
    colors: decodeColors(params.getAll('pc'))
  };
}

/** Requested terrain if available; otherwise ion with a token, else the free Terrarium tiles. */
export function resolveTerrain(requested: TerrainSource | null, hasIonToken: boolean): TerrainSource {
  if (requested === 'ion' && !hasIonToken) return 'terrarium';
  return requested ?? (hasIonToken ? 'ion' : 'terrarium');
}

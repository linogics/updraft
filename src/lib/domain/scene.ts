// Serialisable replay scene. Lives in the URL today; becomes a shareable server-side scene later.

export const CAMERA_MODES = ['follow', 'cockpit', 'orbit', 'free'] as const;
export const COLOR_MODES = ['vario', 'phase', 'pilot'] as const;
export const LAYOUTS = ['3d', '2d', 'split'] as const;

export type CameraMode = (typeof CAMERA_MODES)[number];
export type ColorMode = (typeof COLOR_MODES)[number];
export type Layout = (typeof LAYOUTS)[number];

export interface SceneConfig {
  flightIds: string[];
  camera: CameraMode;
  colorBy: ColorMode;
  layout: Layout;
}

export const DEFAULT_SCENE: SceneConfig = { flightIds: [], camera: 'follow', colorBy: 'vario', layout: '3d' };

function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function encodeScene(scene: SceneConfig): string {
  const params = new URLSearchParams();
  for (const id of scene.flightIds) params.append('f', id);
  params.set('camera', scene.camera);
  params.set('color', scene.colorBy);
  params.set('layout', scene.layout);
  return params.toString();
}

export function decodeScene(params: Pick<URLSearchParams, 'get' | 'getAll'>): SceneConfig {
  return {
    flightIds: params.getAll('f'),
    camera: pick(CAMERA_MODES, params.get('camera'), DEFAULT_SCENE.camera),
    colorBy: pick(COLOR_MODES, params.get('color'), DEFAULT_SCENE.colorBy),
    layout: pick(LAYOUTS, params.get('layout'), DEFAULT_SCENE.layout)
  };
}

import type { LatLon } from '#lib/domain/geo';
import type { GlideParams } from '#lib/domain/glide';

const KEY = 'updraft.glide';

/** Glider and conditions. SI units: metres, m/s, degrees the wind blows from. */
export interface GlideInputs extends GlideParams {
  altitude: number;
}

const DEFAULTS: GlideInputs = { altitude: 3000, ld: 30, airspeed: 10, windSpeed: 0, windFrom: 270, margin: 150 };

/** Whether this browser already holds inputs, read once at load. */
let stored = false;

function load(): GlideInputs {
  try {
    stored = localStorage.getItem(KEY) !== null;
    const s = JSON.parse((typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) ?? 'null') as Record<
      string,
      unknown
    > | null;
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof GlideInputs)[]) {
      if (typeof s?.[k] === 'number' && Number.isFinite(s[k])) out[k] = s[k];
    }

    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

/** Glide calculator of the planner, shared by the panel, the map and the page. Inputs are kept in this browser. */
class GlideState {
  inputs = $state<GlideInputs>(load());
  /** Inputs came from this browser or were edited, so the logbook does not overwrite them. */
  stored = stored;
  /** The one point the reach area is computed from. */
  start = $state.raw<LatLon | null>(null);
  /** The next map click sets the start point instead of adding a route point. */
  armed = $state(false);
  /** Ring of the reach area, null while unknown. */
  reach = $state.raw<LatLon[] | null>(null);
  /** Ground height at the start in metres MSL, null while unknown. */
  ground = $state<number | null>(null);

  set(patch: Partial<GlideInputs>) {
    this.inputs = { ...this.inputs, ...patch };
    this.stored = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.inputs));
    } catch {
      // Not persisted, the values still apply for this session.
    }
  }
}

export const glide = new GlideState();

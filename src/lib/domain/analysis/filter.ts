import type { Thermal } from '../model';

export interface ThermalFilter {
  /** Minimum altitude gain, metres. */
  minGain: number;
  /** Minimum average climb, m/s. */
  minClimb: number;
}

export const DEFAULT_FILTER: ThermalFilter = { minGain: 0, minClimb: 0 };

/** Thermals worth showing: climbing ones that meet both thresholds. */
export function filterThermals(thermals: Thermal[], filter: ThermalFilter): Thermal[] {
  return thermals.filter((t) => t.gain > 0 && t.gain >= filter.minGain && t.avgClimb >= filter.minClimb);
}

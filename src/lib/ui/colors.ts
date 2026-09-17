import type { PhaseKind } from '../domain/model';

// Categorical order validated for the dark UI surface (dataviz reference palette, dark steps).
const PILOT_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function pilotColor(index: number): string {
  return PILOT_PALETTE[index % PILOT_PALETTE.length];
}

const PHASE_COLORS: Record<PhaseKind, string> = {
  thermalling: '#d95926',
  gliding: '#3987e5',
  searching: '#a0a0a0'
};

export function phaseColor(kind: PhaseKind): string {
  return PHASE_COLORS[kind];
}

/** Vario range mapped onto the full colour scale, m/s. */
const VARIO_LIMIT = 5;
const NEUTRAL: [number, number, number] = [0xe5, 0xe5, 0xe5];
const CLIMB: [number, number, number] = [0xe6, 0x67, 0x67];
const SINK: [number, number, number] = [0x39, 0x87, 0xe5];

function hex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/** Diverging scale: sink blue, neutral grey at 0, climb red. Clamped at ±VARIO_LIMIT. */
export function varioColor(vario: number): string {
  const k = Math.max(-1, Math.min(1, vario / VARIO_LIMIT));
  const end = k >= 0 ? CLIMB : SINK;
  const a = Math.abs(k);
  return hex([0, 1, 2].map((c) => NEUTRAL[c] + (end[c] - NEUTRAL[c]) * a) as [number, number, number]);
}

// Canvas 2D overlay for exported frames. Framework-free: only the context it draws on is touched.
import { formatClock, formatDuration } from '../ui/format';
import { formatAlt, formatDistance, formatSpeed, formatVario, type Units } from '../ui/units';
import { indexAt } from '../domain/timeline';
import type { LoadedFlight } from '../state/replay.svelte';

export interface OverlayParts {
  hud: boolean;
  altitudeGraph: boolean;
  stats: boolean;
  minimap: boolean;
  credits: boolean;
}

export const ALL_PARTS: OverlayParts = { hud: true, altitudeGraph: true, stats: true, minimap: true, credits: true };

export const PART_LABELS: [keyof OverlayParts, string][] = [
  ['hud', 'Flight data'],
  ['altitudeGraph', 'Altitude graph'],
  ['stats', 'Stats'],
  ['minimap', 'Minimap'],
  ['credits', 'Map credits']
];

export interface OverlayData {
  /** Flight shown in the HUD, altitude graph and stats. */
  selected: LoadedFlight;
  /** Visible flights, drawn on the minimap. */
  flights: LoadedFlight[];
  /** Replay clock, Unix ms. */
  replayTime: number;
  units: Units;
  /** Map and terrain attribution, one line. */
  credits: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayLayout {
  /** Factor applied to every size, relative to a 1080 px short side. */
  scale: number;
  hud: Rect | null;
  altitudeGraph: Rect | null;
  stats: Rect | null;
  minimap: Rect | null;
  credits: Rect | null;
}

// Sizes at a 1080 px short side. Everything scales by min(w, h) / BASE.
const BASE = 1080;
const MARGIN = 24;
const GAP = 16;
const PAD = 16;
const ROW = 36;
const HUD_ROWS = 5;
const STATS_ROWS = 7;
const HUD_W = 300;
const STATS_W = 340;
const HUD_H = 2 * PAD + HUD_ROWS * ROW;
const STATS_H = 2 * PAD + STATS_ROWS * ROW;
const MAP_SIZE = 260;
const GRAPH_H = 160;
const CREDITS_H = 26;
const RADIUS = 12;

const PANEL = 'rgba(0, 0, 0, 0.55)';
const TEXT = '#fff';
const MUTED = 'rgba(255, 255, 255, 0.7)';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Panel boxes for a frame. Landscape and square put panels in the corners,
 * portrait stacks them top to bottom. Disabled parts return null.
 */
export function overlayLayout(w: number, h: number, parts: OverlayParts): OverlayLayout {
  const s = Math.min(w, h) / BASE;
  const m = MARGIN * s;
  const g = GAP * s;
  const graphH = GRAPH_H * s;
  const creditsH = CREDITS_H * s;
  const credits = parts.credits ? { x: m, y: h - m - creditsH, w: w - 2 * m, h: creditsH } : null;
  const bottom = credits ? credits.y - g : h - m;
  const out: OverlayLayout = { scale: s, hud: null, altitudeGraph: null, stats: null, minimap: null, credits };
  const hudH = HUD_H * s;
  const statsH = STATS_H * s;
  const mapS = MAP_SIZE * s;

  if (h > w * 1.15) {
    let y = m;
    if (parts.hud) {
      out.hud = { x: m, y, w: w - 2 * m, h: hudH };
      y += hudH + g;
    }
    if (parts.stats) {
      out.stats = { x: m, y, w: w - 2 * m, h: statsH };
      y += statsH + g;
    }
    let mapBottom = bottom;
    if (parts.altitudeGraph) {
      out.altitudeGraph = { x: m, y: bottom - graphH, w: w - 2 * m, h: graphH };
      mapBottom = bottom - graphH - g;
    }
    if (parts.minimap) out.minimap = { x: m, y, w: w - 2 * m, h: mapBottom - y };
    return out;
  }

  if (parts.hud) out.hud = { x: m, y: m, w: HUD_W * s, h: hudH };
  if (parts.stats) out.stats = { x: w - m - STATS_W * s, y: m, w: STATS_W * s, h: statsH };
  if (parts.minimap) out.minimap = { x: w - m - mapS, y: bottom - mapS, w: mapS, h: mapS };
  if (parts.altitudeGraph) {
    const right = out.minimap ? out.minimap.x - g : w - m;
    out.altitudeGraph = { x: m, y: bottom - graphH, w: right - m, h: graphH };
  }
  return out;
}

/** Paints the overlay panels over a frame of size w x h. */
export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: OverlayData,
  parts: OverlayParts
) {
  const layout = overlayLayout(w, h, parts);
  const { scale: s } = layout;
  ctx.save();
  ctx.textBaseline = 'middle';
  if (layout.hud) paintHud(ctx, layout.hud, s, data);
  if (layout.stats) paintStats(ctx, layout.stats, s, data);
  if (layout.altitudeGraph) paintGraph(ctx, layout.altitudeGraph, s, data);
  if (layout.minimap) paintMinimap(ctx, layout.minimap, s, data);
  if (layout.credits) paintCredits(ctx, layout.credits, s, data.credits);
  ctx.restore();
}

/** Height above ground of fix i, as ReplayState.aglAt. */
function aglOf(f: LoadedFlight, i: number): number | undefined {
  return f.ground ? f.flight.fixes[i].alt + f.altOffset - f.ground[i] : undefined;
}

function panel(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fill();
}

function font(ctx: CanvasRenderingContext2D, px: number, weight = 400) {
  ctx.font = `${weight} ${px}px ${FONT}`;
}

/** Label on the left, value on the right, centred on y. */
function row(ctx: CanvasRenderingContext2D, r: Rect, s: number, y: number, label: string, value: string) {
  const pad = PAD * s;
  font(ctx, 20 * s);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText(label, r.x + pad, y);
  const labelW = ctx.measureText(label).width;
  font(ctx, 24 * s, 600);
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  ctx.fillText(value, r.x + r.w - pad, y, Math.max(0, r.w - 2 * pad - labelW - 12 * s));
}

function rowY(r: Rect, s: number, k: number): number {
  return r.y + PAD * s + (k + 0.5) * ROW * s;
}

function paintHud(ctx: CanvasRenderingContext2D, r: Rect, s: number, d: OverlayData) {
  panel(ctx, r, RADIUS * s);
  const { selected: sel, units: u } = d;
  const { fixes } = sel.flight;
  const i = indexAt(fixes, d.replayTime);
  const inFlight = d.replayTime >= fixes[0].t && d.replayTime <= fixes[fixes.length - 1].t;
  const agl = aglOf(sel, i);
  const rows: [string, string][] = [
    ['Time', formatClock(d.replayTime - sel.timeOffset)],
    ['Altitude', formatAlt(fixes[i].alt, u)],
    ['AGL', agl === undefined ? '–' : formatAlt(agl, u)],
    ['Vario', formatVario(inFlight ? sel.analysis.vario[i] : 0, u)],
    ['Ground speed', formatSpeed(inFlight ? sel.analysis.speed[i] : 0, u)]
  ];
  rows.forEach(([label, value], k) => row(ctx, r, s, rowY(r, s, k), label, value));
}

function paintStats(ctx: CanvasRenderingContext2D, r: Rect, s: number, d: OverlayData) {
  panel(ctx, r, RADIUS * s);
  const { source: f, analysis } = d.selected;
  const st = analysis.stats;
  const rows: [string, string][] = [
    ['Pilot', f.pilot],
    ['Glider', f.glider ?? f.sourceName],
    ['Site', f.site ?? '–'],
    ['Date', f.date],
    ['Duration', formatDuration(st.duration)],
    ['Track', formatDistance(st.trackLength, d.units)],
    ['Max altitude', formatAlt(st.maxAlt, d.units)]
  ];
  rows.forEach(([label, value], k) => row(ctx, r, s, rowY(r, s, k), label, value));
}

function paintGraph(ctx: CanvasRenderingContext2D, r: Rect, s: number, d: OverlayData) {
  panel(ctx, r, RADIUS * s);
  const { flight, analysis, color } = d.selected;
  const { fixes } = flight;
  const i = indexAt(fixes, d.replayTime);
  const pad = 14 * s;
  const top = pad + 26 * s;
  const plot = { x: r.x + pad, y: r.y + top, w: r.w - 2 * pad, h: r.h - top - pad };
  const first = fixes[0].t;
  const span = Math.max(1, fixes[fixes.length - 1].t - first);
  const { minAlt, maxAlt } = analysis.stats;
  const altSpan = Math.max(1, maxAlt - minAlt);
  const x = (t: number) => plot.x + ((t - first) / span) * plot.w;
  const y = (alt: number) => plot.y + plot.h - ((alt - minAlt) / altSpan) * plot.h;

  // About two samples per pixel is plenty for a line.
  const step = Math.max(1, Math.floor(fixes.length / (plot.w * 2)));
  ctx.beginPath();
  for (let k = 0; k < fixes.length; k += step) {
    const f = fixes[k];
    if (k === 0) ctx.moveTo(x(f.t), y(f.alt));
    else ctx.lineTo(x(f.t), y(f.alt));
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * s;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const cx = x(fixes[i].t);
  ctx.beginPath();
  ctx.moveTo(cx, plot.y);
  ctx.lineTo(cx, plot.y + plot.h);
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, y(fixes[i].alt), 6 * s, 0, Math.PI * 2);
  ctx.fillStyle = TEXT;
  ctx.fill();

  font(ctx, 20 * s, 600);
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText('Altitude', r.x + pad, r.y + pad + 9 * s);
  ctx.textAlign = 'right';
  ctx.fillText(formatAlt(fixes[i].alt, d.units), r.x + r.w - pad, r.y + pad + 9 * s);
}

function paintMinimap(ctx: CanvasRenderingContext2D, r: Rect, s: number, d: OverlayData) {
  panel(ctx, r, RADIUS * s);
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const { flight } of d.flights) {
    for (const f of flight.fixes) {
      minLat = Math.min(minLat, f.lat);
      maxLat = Math.max(maxLat, f.lat);
      minLon = Math.min(minLon, f.lon);
      maxLon = Math.max(maxLon, f.lon);
    }
  }
  if (!Number.isFinite(minLat)) return;

  const pad = 16 * s;
  const box = { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad };
  // Longitude shrinks with latitude, so scale it by cos(lat) to keep shapes true.
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const k = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * k) / 2;
  const offY = box.y + (box.h - spanY * k) / 2;
  const project = (lat: number, lon: number) => [offX + (lon - minLon) * kx * k, offY + (maxLat - lat) * k] as const;

  for (const { flight, color } of d.flights) {
    const { fixes } = flight;
    const step = Math.max(1, Math.floor(fixes.length / (box.w * 2)));
    ctx.beginPath();
    for (let j = 0; j < fixes.length; j += step) {
      const [px, py] = project(fixes[j].lat, fixes[j].lon);
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * s;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  for (const { flight, color } of d.flights) {
    const { fixes } = flight;
    const f = fixes[indexAt(fixes, d.replayTime)];
    const [px, py] = project(f.lat, f.lon);
    const isSelected = flight.id === d.selected.flight.id;
    ctx.beginPath();
    ctx.arc(px, py, (isSelected ? 7 : 5) * s, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }
}

/** Right-aligned attribution, boxed to the width of its text. */
function paintCredits(ctx: CanvasRenderingContext2D, r: Rect, s: number, text: string) {
  if (!text) return;
  const pad = 8 * s;
  font(ctx, 16 * s);
  const boxW = Math.min(r.w, ctx.measureText(text).width + 2 * pad);
  const box = { x: r.x + r.w - boxW, y: r.y, w: boxW, h: r.h };
  panel(ctx, box, 6 * s);
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  ctx.fillText(text, r.x + r.w - pad, r.y + r.h / 2, r.w - 2 * pad);
}

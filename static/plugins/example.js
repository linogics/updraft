// Reference plugin for the updraft studio, see docs/plugins.md.
// Shows the altitude of the selected pilot and the climb over the last 10 s.
// Plain JavaScript, no build step. The default export is the whole contract.

/** @import { PluginFlight, StudioService } from '../../src/lib/studio/studioService.svelte' */

const WINDOW = 10_000;
const M_TO_FT = 3.28084;

// The studio calls drawExport(ctx2d, time) without a context, so mount() keeps the studio service here.
/** @type {StudioService | null} */
let current = null;

/**
 * The fix at or just before `time`, ms on the studio clock. Fixes are sorted by time.
 * @param {PluginFlight['fixes']} fixes
 * @param {number} time
 */
const fixAt = (fixes, time) => fixes.findLast((f) => f.t <= time);

/**
 * Altitude and climb of the selected pilot at `time`, or null when there is no data at that time.
 * @param {StudioService} studio
 * @param {number} time
 */
function read(studio, time) {
  const flight = studio.flights().find((f) => f.id === studio.selectedId());
  const now = flight && fixAt(flight.fixes, time);
  if (!now) return null;

  const before = fixAt(flight.fixes, time - WINDOW);
  // Metres per second over the window, 0 until the flight is 10 s old.
  const climb = before ? (now.alt - before.alt) / ((now.t - before.t) / 1000 || 1) : 0;
  const { alt, vario } = studio.units();
  const feet = alt === 'ft';

  return {
    pilot: flight.pilot,
    color: flight.color,
    // Show the altitude in the unit the user picked. The vario here is shown in m/s or ft/min only.
    altitude: `${Math.round(feet ? now.alt * M_TO_FT : now.alt)} ${alt}`,
    climb: vario === 'ms' ? `${climb.toFixed(1)} m/s` : `${Math.round(climb * M_TO_FT * 60)} ft/min`
  };
}

/** @type {import('../../src/lib/studio/plugins').StudioPlugin} */
export default {
  id: 'example/altitude',
  name: 'Example',
  kind: 'studio',
  apiVersion: 2,
  dock: 'right',
  // Plugins depend on services, not on other plugins. ctx.use only hands out what is listed here.
  requires: ['updraft/studio@1'],

  mount(el, ctx) {
    /** @type {StudioService} */
    const studio = ctx.use('updraft/studio@1');
    current = studio;

    // Everything the plugin creates goes into el or ctx.overlay, the studio removes the overlay on unmount.
    const box = document.createElement('div');
    box.style.cssText = 'padding:12px;font:14px system-ui,sans-serif';
    el.append(box);

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:12px;bottom:12px;padding:2px 8px;border-radius:4px;color:#fff';
    ctx.overlay.append(label);

    const draw = () => {
      const r = read(studio, studio.time());
      // textContent, never innerHTML: names come from flight files.
      box.textContent = r ? `${r.pilot}: ${r.altitude}, ${r.climb}` : 'No pilot selected.';
      label.textContent = r ? r.altitude : '';
      label.style.background = r ? r.color : 'transparent';
    };

    // subscribe does not fire for the current state, so draw once yourself.
    const stop = ctx.subscribe(draw);
    draw();

    // The returned function is the destroy function.
    return () => {
      stop();
      current = null;
    };
  },

  // Called for every frame of an image or video export. Must be synchronous.
  drawExport(c2d, time) {
    const r = current && read(current, time);
    if (!r) return;

    c2d.font = `${Math.round(c2d.canvas.height / 30)}px sans-serif`;
    c2d.textBaseline = 'top';
    c2d.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const text = `${r.pilot} ${r.altitude}`;
    c2d.fillRect(0, 0, c2d.measureText(text).width + 32, c2d.canvas.height / 14);
    c2d.fillStyle = '#fff';
    c2d.fillText(text, 16, 8);
  }
};

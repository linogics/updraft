// Reference plugin for the updraft studio, see docs/plugins.md.
// Shows the camera heading as a compass rose in the overlay and paints it into exports.
// It reads the Cesium viewer through studio.viewer(), which is null in the 2D map.
// Plain JavaScript, no build step. The default export is the whole contract.

/** @import { StudioService } from '../../src/lib/studio/studioService.svelte' */

const KEY = 'example/compass:pos';
const SPOTS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const DEFAULT_SPOT = 'top-right';
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SVG = 'http://www.w3.org/2000/svg';

// The studio calls drawExport(ctx2d, time) without a context, so mount() keeps the studio service here.
/** @type {StudioService | null} */
let current = null;

// Storage can throw (private mode, blocked cookies), so every access is wrapped. The stored value is untrusted.
function loadSpot() {
  try {
    const value = localStorage.getItem(KEY);
    return SPOTS.includes(value ?? '') ? /** @type {string} */ (value) : DEFAULT_SPOT;
  } catch {
    return DEFAULT_SPOT;
  }
}

/** @param {string} spot */
function saveSpot(spot) {
  try {
    localStorage.setItem(KEY, spot);
  } catch {
    // Not persisted, the choice still works for this session.
  }
}

/** Compass point for a heading in degrees, e.g. 273 gives 'W'. */
export const cardinal = (/** @type {number} */ deg) => POINTS[Math.round(deg / 45) % 8];

/**
 * Camera heading in whole degrees, 0 to 359. 0 (north up) when there is no 3D view.
 * @param {StudioService | null} studio
 */
function headingDeg(studio) {
  // Check the viewer every time, it comes and goes with the 2D/3D switch.
  const viewer = studio?.viewer();
  const deg = viewer ? (viewer.camera.heading * 180) / Math.PI : 0;
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * Column and row, 0 to 2, of a spot in the 3x3 grid.
 * @param {string} spot
 */
function cell(spot) {
  const parts = spot.split('-');
  const col = parts.includes('left') ? 0 : parts.includes('right') ? 2 : 1;
  const row = parts.includes('top') ? 0 : parts.includes('bottom') ? 2 : 1;
  return { col, row };
}

/**
 * Centre of a rose with radius `r` at `spot` inside a width x height box. The overlay uses the same margin.
 * @param {string} spot
 * @param {number} width
 * @param {number} height
 * @param {number} r
 */
function spotCenter(spot, width, height, r) {
  const inset = r * 1.4;
  const { col, row } = cell(spot);
  return { x: [inset, width / 2, width - inset][col], y: [inset, height / 2, height - inset][row] };
}

/** @param {string} tag @param {Record<string, string>} attrs */
function svg(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/** @type {import('../../src/lib/studio/plugins').StudioPlugin} */
export default {
  id: 'example/compass',
  name: 'Compass',
  kind: 'studio',
  apiVersion: 2,
  dock: 'right',
  requires: ['updraft/studio@1'],

  mount(el, ctx) {
    /** @type {StudioService} */
    const studio = ctx.use('updraft/studio@1');
    current = studio;
    let spot = loadSpot();

    // The rose, built with DOM calls. The group rotates, the wrapper sits at the chosen spot.
    const rose = svg('svg', { viewBox: '-50 -50 100 100', width: '96', height: '96' });
    rose.style.cssText = 'position:absolute;transform:translate(-50%,-50%);filter:drop-shadow(0 0 2px #000)';
    const turn = svg('g', {});
    turn.append(svg('circle', { r: '46', fill: 'rgba(0,0,0,0.45)', stroke: '#fff', 'stroke-width': '2' }));
    turn.append(svg('path', { d: 'M0 -34 L7 0 L-7 0 Z', fill: '#e53935' }));
    turn.append(svg('path', { d: 'M0 34 L7 0 L-7 0 Z', fill: '#fff' }));
    for (const [letter, x, y] of [
      ['N', 0, -38],
      ['E', 38, 0],
      ['S', 0, 38],
      ['W', -38, 0]
    ]) {
      const t = svg('text', {
        x: String(x),
        y: String(y),
        fill: letter === 'N' ? '#e53935' : '#fff',
        'font-size': '13',
        'font-weight': 'bold',
        'font-family': 'system-ui,sans-serif',
        'text-anchor': 'middle',
        'dominant-baseline': 'central'
      });
      t.textContent = String(letter);
      turn.append(t);
    }

    rose.append(turn);
    ctx.overlay.append(rose);

    const text = document.createElement('div');
    text.style.cssText = 'padding:12px 12px 4px;font:14px system-ui,sans-serif';
    const grid = document.createElement('div');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Compass position');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,2.25rem);gap:4px;padding:8px 12px 12px';
    el.append(text, grid);

    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    for (const s of SPOTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'height:2.25rem;cursor:pointer';
      // Visible text is a dot, the label carries the meaning.
      b.textContent = '•';
      const name = s.replace('-', ' ');
      b.setAttribute('aria-label', name[0].toUpperCase() + name.slice(1));
      b.addEventListener('click', () => {
        spot = s;
        saveSpot(s);
        place();
      });
      buttons.set(s, b);
      grid.append(b);
    }

    // Same inset as spotCenter in exports, for the 48 px radius of the rose.
    const INSET = '67px';
    function place() {
      const { col, row } = cell(spot);
      rose.style.left = [INSET, '50%', `calc(100% - ${INSET})`][col];
      rose.style.top = [INSET, '50%', `calc(100% - ${INSET})`][row];
      for (const [s, b2] of buttons) b2.setAttribute('aria-pressed', String(s === spot));
    }

    let shown = -1;
    const draw = () => {
      const deg = headingDeg(studio);
      // Only touch the DOM when the rounded degrees changed.
      if (deg === shown) return;
      shown = deg;
      turn.setAttribute('transform', `rotate(${-deg})`);
      text.textContent = `${deg}° ${cardinal(deg)}`;
    };

    // The viewer can be replaced or disappear, so re-attach the render listener when its identity changes.
    /** @type {object | null} */
    let attached = null;
    let detach = () => {};

    const sync = () => {
      const viewer = studio.viewer();
      if (viewer !== attached) {
        detach();
        attached = viewer;
        detach = viewer ? viewer.scene.postRender.addEventListener(draw) : () => {};
      }

      draw();
    };

    place();
    sync();
    // The studio has no viewer event, so a slow poll catches the 2D/3D switch. postRender does the per-frame work.
    const timer = setInterval(sync, 500);

    return () => {
      clearInterval(timer);
      detach();
      current = null;
    };
  },

  // Called for every frame of an image or video export. Must be synchronous.
  drawExport(c2d, time) {
    void time;
    const { width, height } = c2d.canvas;
    const r = height / 16;
    const { x, y } = spotCenter(loadSpot(), width, height, r);

    c2d.save();
    c2d.translate(x, y);
    c2d.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c2d.strokeStyle = '#fff';
    c2d.lineWidth = r / 23;
    c2d.beginPath();
    c2d.arc(0, 0, r, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();

    // Rotate so N points to true north, like the overlay rose.
    c2d.rotate((-headingDeg(current) * Math.PI) / 180);
    const k = r / 46;
    for (const [dy, color] of [
      [-34, '#e53935'],
      [34, '#fff']
    ]) {
      c2d.fillStyle = String(color);
      c2d.beginPath();
      c2d.moveTo(0, Number(dy) * k);
      c2d.lineTo(7 * k, 0);
      c2d.lineTo(-7 * k, 0);
      c2d.closePath();
      c2d.fill();
    }

    c2d.font = `bold ${13 * k}px system-ui, sans-serif`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    for (const [letter, lx, ly] of [
      ['N', 0, -38],
      ['E', 38, 0],
      ['S', 0, 38],
      ['W', -38, 0]
    ]) {
      c2d.fillStyle = letter === 'N' ? '#e53935' : '#fff';
      c2d.fillText(String(letter), Number(lx) * k, Number(ly) * k);
    }

    c2d.restore();
  }
};

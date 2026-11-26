// Regenerates src/lib/demo/groundGrid.json, the ground height grid the demo flight tests check against.
// Run with `node scripts/demo-terrain.mjs` (needs network access, no dependencies).
// Samples Terrarium zoom-12 tiles (height = r*256 + g + b/256 - 32768, same as src/lib/domain/terrarium.ts).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ZOOM = 12;
const TILE = 256;
const STEP_M = 100;
const BOUNDS = { south: 47.58, north: 47.73, west: 11.4, east: 11.66 };
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/demo/groundGrid.json');

const tileUrl = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;
const lonToPx = (lon) => ((lon + 180) / 360) * 2 ** ZOOM * TILE;
const latToPy = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM * TILE;
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Minimal PNG reader for the 8-bit, non-interlaced RGB(A) tiles Terrarium serves.
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG depth or interlace');
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + len;
  }

  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG colour type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[dst - stride + i - bpp] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      if (predictor === undefined) throw new Error(`bad PNG filter ${filter}`);
      out[dst + i] = (x + predictor) & 0xff;
    }
  }

  return { bpp, pixels: out };
}

const { south, north, west, east } = BOUNDS;
const midLat = ((south + north) / 2) * (Math.PI / 180);
const rows = Math.round(((north - south) * 111_320) / STEP_M) + 1;
const cols = Math.round(((east - west) * 111_320 * Math.cos(midLat)) / STEP_M) + 1;

// Pixel 1 beyond each corner is needed for bilinear reads at the edge.
const xMin = Math.floor((lonToPx(west) - 1) / TILE);
const xMax = Math.floor((lonToPx(east) + 1) / TILE);
const yMin = Math.floor((latToPy(north) - 1) / TILE);
const yMax = Math.floor((latToPy(south) + 1) / TILE);

const keys = [];
for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) keys.push([x, y]);
const tiles = new Map(
  await Promise.all(
    keys.map(async ([x, y]) => {
      const res = await fetch(tileUrl(x, y));
      if (!res.ok) throw new Error(`tile ${x}/${y} HTTP ${res.status}`);
      return [`${x}/${y}`, decodePng(Buffer.from(await res.arrayBuffer()))];
    })
  )
);

function pixelHeight(px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  const tile = tiles.get(`${tx}/${ty}`);
  if (!tile) throw new Error(`missing tile ${tx}/${ty}`);
  const i = ((py - ty * TILE) * TILE + (px - tx * TILE)) * tile.bpp;
  const p = tile.pixels;
  return p[i] * 256 + p[i + 1] + p[i + 2] / 256 - 32768;
}

// Bilinear over pixel centres.
function groundAt(lat, lon) {
  const fx = lonToPx(lon) - 0.5;
  const fy = latToPy(lat) - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = pixelHeight(x0, y0) * (1 - tx) + pixelHeight(x0 + 1, y0) * tx;
  const bottom = pixelHeight(x0, y0 + 1) * (1 - tx) + pixelHeight(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

// Row 0 is the north edge, rows and columns are evenly spaced over BOUNDS.
const heights = [];
for (let row = 0; row < rows; row++) {
  const lat = north - (row * (north - south)) / (rows - 1);
  const line = [];
  for (let col = 0; col < cols; col++) {
    const lon = west + (col * (east - west)) / (cols - 1);
    line.push(Math.round(groundAt(lat, lon)));
  }

  heights.push(line.join(','));
}

const json = `{
  "south": ${south},
  "west": ${west},
  "north": ${north},
  "east": ${east},
  "rows": ${rows},
  "cols": ${cols},
  "heights": [
${heights.join(',\n')}
  ]
}
`;
writeFileSync(OUT, json);
console.log(`wrote ${OUT}: ${rows} x ${cols}, ${json.length} bytes`);

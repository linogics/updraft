// UI timing on big data. Run with `npm run bench:ui`, skipped in CI (runner timing is noisy).
// Budgets: import + analysis of an 8 h flight under 1 s, frames under 16 ms, main-thread tasks under 50 ms.
// Run it on a machine with a GPU. Without one Chromium renders WebGL on the CPU and frame times are meaningless.
import type { Page } from '@playwright/test';
import { buildIgc } from '../src/lib/domain/testing/igc-builder';
import { chain, circle, straight, type Start } from '../src/lib/domain/testing/tracks';
import { expect, test } from './fixtures';

const DAY = Date.UTC(2026, 6, 15);

/** cycles of a 5 min thermal and a 5 min glide at 1 Hz. 48 cycles = 8 h. */
function track(cycles: number) {
  const cycle = [
    (s: Start) => circle(s, { radius: 40, period: 22, climb: 2, duration: 300 }),
    (s: Start) => straight(s, { headingDeg: 60, speed: 11, climb: -2, duration: 300 })
  ];
  return chain(...Array.from({ length: cycles }, () => cycle).flat());
}

const igcOf = (fixes: ReturnType<typeof track>) =>
  buildIgc(fixes.map((f) => ({ sec: (f.t - DAY) / 1000, lat: f.lat, lon: f.lon, gpsAlt: f.alt })));

// Big data and slow software WebGL on machines without a GPU need room.
test.describe.configure({ timeout: 180_000 });

// Records main-thread tasks over 50 ms from page start.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({
      type: 'longtask',
      buffered: true
    });
  });
});

const longTasks = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    const all = w.__long.splice(0);
    return { count: all.length, max: Math.round(Math.max(0, ...all)) };
  });

function report(name: string, values: Record<string, number>) {
  console.log(
    `${name}: ${Object.entries(values)
      .map(([k, v]) => `${k}=${Math.round(v)}`)
      .join(' ')}`
  );
}

async function importBig(page: Page) {
  await page.goto('/');
  const t0 = Date.now();
  await page.locator('input[type=file]').setInputFiles({
    name: 'long.igc',
    mimeType: 'text/plain',
    buffer: Buffer.from(igcOf(track(48)))
  });
  await page.waitForURL(/\/replay\?/);
  await expect(page.getByRole('navigation', { name: 'Outliner' })).toBeVisible({ timeout: 60_000 });
  return Date.now() - t0;
}

test('import an 8 h flight', async ({ page }) => {
  const ms = await importBig(page);
  const long = await longTasks(page);
  report('import 8h', { ms, longTasks: long.count, maxTask: long.max });
  expect.soft(ms, 'import until replay ready').toBeLessThan(1000);
});

test('play and seek an 8 h flight', async ({ page }) => {
  await importBig(page);
  // Headless Chromium often renders WebGL on the CPU (SwiftShader). Then frame times say nothing.
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log(`webgl renderer: ${renderer}`);
  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    console.log('warning: software WebGL, run `npm run bench:ui -- --headed` on a machine with a GPU');
  }
  await page.waitForTimeout(1000);
  await longTasks(page);

  await page.getByRole('button', { name: 'Play' }).click();
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        let last = performance.now();
        const end = last + 3000;
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      })
  );
  await page.getByRole('button', { name: 'Pause' }).click();
  frames.sort((a, b) => a - b);
  const p95 = frames[Math.floor(frames.length * 0.95)];
  const play = await longTasks(page);
  report('play', { frames: frames.length, p95, max: frames.at(-1)!, longTasks: play.count, maxTask: play.max });

  // Seek like a scrub: 20 jumps, each timed until the next painted frame.
  const seeks = await page.getByRole('slider', { name: 'Replay position' }).evaluate(async (el) => {
    const input = el as HTMLInputElement;
    const [min, max] = [Number(input.min), Number(input.max)];
    const out: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const t0 = performance.now();
      input.value = String(min + ((max - min) * i) / 21);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push(performance.now() - t0);
    }
    return out.sort((a, b) => a - b);
  });
  const seek = await longTasks(page);
  report('seek', { p50: seeks[10], max: seeks.at(-1)!, longTasks: seek.count, maxTask: seek.max });

  expect.soft(p95, 'play frame p95').toBeLessThan(17);
  expect.soft(seeks[10], 'seek p50').toBeLessThan(100);
});

test('logbook with 300 flights', async ({ page }) => {
  // 300 flights of 20 min each, restored from one backup file.
  const fixes = track(2);
  const flights = Array.from({ length: 300 }, (_, i) => ({
    id: `perf-${i}`,
    sourceName: `perf-${i}.igc`,
    pilot: 'Perf Pilot',
    glider: `Glider ${i % 3}`,
    site: `Site ${i % 12}`,
    date: new Date(DAY - i * 86_400_000).toISOString().slice(0, 10),
    fixes: fixes.map((f) => ({ ...f, t: f.t - i * 86_400_000 }))
  }));
  const backup = { app: 'updraft', version: 1, exportedAt: '', flights, manual: [], cameraPaths: [], prefs: {} };

  await page.goto('/logbook');
  await page
    .getByText('Import backup')
    .locator('..')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'perf.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup))
    });
  const r0 = Date.now();
  await page.getByRole('button', { name: 'Merge with this browser' }).click();
  await expect(page.getByText(/Restored 300 flights/)).toBeVisible({ timeout: 120_000 });
  const restoreMs = Date.now() - r0;

  await page.reload();
  const t0 = Date.now();
  await expect(page.getByRole('checkbox', { name: /^Select Perf Pilot/ })).toHaveCount(300, { timeout: 60_000 });
  const listMs = Date.now() - t0;
  const list = await longTasks(page);
  report('logbook 300', { restoreMs, listMs, longTasks: list.count, maxTask: list.max });

  expect.soft(listMs, 'logbook list ready').toBeLessThan(1000);
});

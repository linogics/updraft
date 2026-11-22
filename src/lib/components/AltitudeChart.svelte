<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { resampleAltitudes } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { phaseColor } from '#lib/ui/colors';
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatClock } from '#lib/ui/format';
  import { formatAlt, toAlt, UNIT_LABELS } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  let container: HTMLDivElement;
  let plot: uPlot | undefined = $state.raw();
  let cursorX = $state<number | null>(null);
  /** AGL was chosen but a visible flight has no ground heights yet, so the chart stays MSL. */
  let needsGround = $state(false);
  // Set by build(), read by the draw hooks.
  let agl = false;
  let tooltip = $state<{ left: number; time: string; rows: { name: string; color: string; alt: string }[] } | null>(null);

  const INK = '#9aa0a6';
  const GRID = 'rgba(255,255,255,0.06)';

  /** Phase bands of the selected flight, drawn behind the series. */
  function drawPhases(u: uPlot) {
    const sel = replay.selected;
    if (!sel) return;
    const { ctx, bbox } = u;
    const { fixes } = sel.flight;
    ctx.save();
    for (const p of sel.analysis.phases) {
      if (p.kind === 'searching') continue;
      const x0 = u.valToPos(fixes[p.start].t / 1000, 'x', true);
      const x1 = u.valToPos(fixes[p.end].t / 1000, 'x', true);
      ctx.fillStyle = phaseColor(p.kind) + '22';
      ctx.fillRect(x0, bbox.top, Math.max(1, x1 - x0), bbox.height);
    }
    ctx.restore();
  }

  /**
   * Transition altitudes of the selected flight: the band between the average arrival
   * and departure height of glides, with direct labels in text ink.
   */
  function drawWorkingBand(u: uPlot) {
    const sel = replay.selected;
    const s = sel && replay.transitionSummary(sel, agl);
    if (!s || s.avgStartAlt == null || s.avgEndAlt == null) return;
    const { ctx, bbox } = u;
    const px = uPlot.pxRatio;
    const top = u.valToPos(s.avgStartAlt, 'y', true);
    const bottom = u.valToPos(s.avgEndAlt, 'y', true);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(bbox.left, top, bbox.width, bottom - top);
    ctx.strokeStyle = 'rgba(154,160,166,0.6)';
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 4 * px]);
    for (const y of [top, bottom]) {
      ctx.beginPath();
      ctx.moveTo(bbox.left, y);
      ctx.lineTo(bbox.left + bbox.width, y);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.font = `${11 * px}px sans-serif`;
    ctx.textAlign = 'right';
    const x = bbox.left + bbox.width - 4 * px;
    ctx.textBaseline = 'bottom';
    ctx.fillText(`leave ⌀ ${formatAlt(s.avgStartAlt, unitPrefs.units)}`, x, top - 2 * px);
    ctx.textBaseline = 'top';
    ctx.fillText(`arrive ⌀ ${formatAlt(s.avgEndAlt, unitPrefs.units)}`, x, bottom + 2 * px);
    ctx.restore();
  }

  /** Where each glide left a climb and reached the next one, on top of the series. */
  function drawTransitionMarks(u: uPlot) {
    const sel = replay.selected;
    if (!sel?.visible) return;
    const { ctx } = u;
    const { fixes } = sel.flight;
    const px = uPlot.pxRatio;
    ctx.save();
    ctx.fillStyle = sel.color;
    ctx.strokeStyle = '#14161b';
    ctx.lineWidth = 2 * px;
    for (const t of sel.climbs.transitions) {
      if (t.kind !== 'glide') continue;
      for (const i of [t.start, t.end]) {
        ctx.beginPath();
        ctx.arc(u.valToPos(fixes[i].t / 1000, 'x', true), u.valToPos(agl ? replay.aglAt(sel, i)! : fixes[i].alt, 'y', true), 4 * px, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function build() {
    plot?.destroy();
    const flights = replay.flights.filter((f) => f.visible);
    if (!flights.length || !container) return;
    agl = altRefPrefs.ref === 'agl' && flights.every((f) => f.ground);
    needsGround = altRefPrefs.ref === 'agl' && !agl;
    const { x, series } = resampleAltitudes(
      flights.map((f) => (agl ? f.flight.fixes.map((fix, i) => ({ ...fix, alt: replay.aglAt(f, i)! })) : f.flight.fixes)),
      2
    );
    const selectedId = replay.selected?.flight.id;

    plot = new uPlot(
      {
        width: container.clientWidth,
        height: container.clientHeight,
        legend: { show: false },
        scales: { x: { time: false } },
        cursor: { drag: { x: false, y: false }, points: { size: 8 } },
        series: [
          {},
          ...flights.map((f) => ({
            label: f.flight.pilot,
            stroke: f.color,
            width: f.flight.id === selectedId ? 2 : 1.25,
            spanGaps: false
          }))
        ],
        axes: [
          {
            stroke: INK,
            grid: { stroke: GRID },
            ticks: { stroke: GRID },
            values: (_u, vals) => vals.map((v) => formatClock(v * 1000).slice(0, 5))
          },
          {
            stroke: INK,
            grid: { stroke: GRID },
            ticks: { stroke: GRID },
            size: 64,
            // Data stays in metres; only the labels follow the unit preference.
            values: (_u, vals) => {
              const alt = unitPrefs.units.alt;
              return vals.map((v) => `${Math.round(toAlt(v, alt))} ${UNIT_LABELS.alt[alt]}`);
            }
          }
        ],
        hooks: {
          drawClear: [drawPhases, drawWorkingBand],
          draw: [drawTransitionMarks],
          setCursor: [
            (u) => {
              const idx = u.cursor.idx;
              if (idx == null || u.cursor.left == null || u.cursor.left < 0) return void (tooltip = null);
              tooltip = {
                left: u.cursor.left,
                time: formatClock(x[idx] * 1000),
                rows: flights
                  .map((f, i) => ({ name: f.flight.pilot, color: f.color, v: series[i][idx] }))
                  .filter((r) => r.v != null)
                  .map((r) => ({ name: r.name, color: r.color, alt: formatAlt(r.v!, unitPrefs.units) }))
              };
            }
          ]
        }
      },
      [x, ...series] as uPlot.AlignedData,
      container
    );

    // Click or drag on the plot to scrub.
    const over = plot.over;
    let dragging = false;
    const seekTo = (e: MouseEvent) => plot && replay.seek(plot.posToVal(e.offsetX, 'x') * 1000);
    over.addEventListener('mousedown', (e) => {
      dragging = true;
      seekTo(e);
    });
    over.addEventListener('mousemove', (e) => dragging && seekTo(e));
    window.addEventListener('mouseup', () => (dragging = false));
  }

  onMount(() => {
    const resize = new ResizeObserver(() => plot?.setSize({ width: container.clientWidth, height: container.clientHeight }));
    resize.observe(container);
    return () => {
      resize.disconnect();
      plot?.destroy();
    };
  });

  // Rebuild on flight set, visibility or selection change.
  $effect(() => {
    void replay.flights;
    void replay.selected;
    void altRefPrefs.ref;
    // build() reads and replaces `plot`; untrack it so the effect does not re-trigger itself.
    untrack(build);
  });

  // Relabel the axis when the altitude unit changes.
  $effect(() => {
    void unitPrefs.units.alt;
    untrack(() => plot?.redraw(false, true));
  });

  // Current-time marker, positioned in plot (CSS px) coordinates.
  $effect(() => {
    const t = replay.time;
    cursorX = plot ? plot.valToPos(t / 1000, 'x') : null;
  });
</script>

<div class="chart" bind:this={container}>
  {#if needsGround}<div class="note">AGL needs ground data</div>{/if}
  {#if plot && cursorX !== null}
    <div class="now" style:left="{plot.over.offsetLeft + cursorX}px" style:top="{plot.over.offsetTop}px" style:height="{plot.over.clientHeight}px"></div>
  {/if}
  {#if plot && tooltip}
    <div class="tip" style:left="{plot.over.offsetLeft + tooltip.left + 12}px">
      <div class="tip-time">{tooltip.time}</div>
      {#each tooltip.rows as r (r.name)}
        <div class="tip-row"><span class="dot" style:background={r.color}></span>{r.name}<b>{r.alt}</b></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .note {
    position: absolute;
    top: 4px;
    right: 8px;
    z-index: 1;
    font-size: 11px;
    color: #9aa0a6;
    pointer-events: none;
  }
  .now {
    position: absolute;
    width: 2px;
    margin-left: -1px;
    background: #fff;
    opacity: 0.8;
    pointer-events: none;
    z-index: 2;
  }
  .tip {
    position: absolute;
    top: 6px;
    z-index: 3;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(20, 22, 27, 0.95);
    border: 1px solid #2c3038;
    color: #e8eaed;
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap;
  }
  .tip-time {
    color: #9aa0a6;
    margin-bottom: 2px;
  }
  .tip-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tip-row b {
    margin-left: auto;
    padding-left: 12px;
    font-weight: 600;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>

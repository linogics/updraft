<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Dropzone from '#lib/components/Dropzone.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { buildDemoFlights } from '#lib/demo/demoFlights';
  import { monthlyHours, totals } from '#lib/domain/logbook';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { importFlights, replayHref } from '#lib/storage/importFlights';
  import { formatAirtime } from '#lib/ui/format';

  let flights = $state<FlightSummary[]>([]);
  let ready = $state(false);
  let busy = $state(false);
  let errors = $state<string[]>([]);

  const sum = $derived(totals(flights));
  const months = $derived(monthlyHours(flights, 12, new Date()));
  const peak = $derived(Math.max(1, ...months.map((m) => m.hours)));
  // Manual logbook entries have no track to replay.
  const last = $derived(flights.find((f) => !f.manual));

  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const day = (date: string) => dateFmt.format(new Date(date));
  const airtime = formatAirtime;
  const hours = (seconds: number) => (seconds / 3600).toFixed(seconds < 36_000 ? 1 : 0);

  onMount(async () => {
    flights = await flightRepository.list();
    ready = true;
  });

  async function onfiles(files: File[]) {
    busy = true;
    const result = await importFlights(files);
    busy = false;
    errors = result.errors;
    if (result.ids.length && !errors.length) goto(replayHref(result.ids));
    else flights = await flightRepository.list();
  }

  async function loadDemo() {
    busy = true;
    const demo = buildDemoFlights();
    for (const f of demo) await flightRepository.save(f);
    goto(replayHref(demo.map((f) => f.id)));
  }
</script>

<svelte:head>
  <title>updraft</title>
</svelte:head>

<main>
  <header>
    <Logo />
    <dl class="readouts" aria-busy={!ready}>
      <div>
        <dt>hours flown</dt>
        <dd>{ready ? hours(sum.seconds) : '–'}</dd>
      </div>
      <div>
        <dt>flights</dt>
        <dd>{ready ? sum.flights : '–'}</dd>
      </div>
    </dl>
  </header>

  <section class="tools" aria-label="Tools">
    <a class="tool" href={last ? replayHref([last.id]) : '/logbook'}>
      <h2>Replay</h2>
      <p>Fly a day again in 3D. Compare pilots on one clock, key the camera, export video.</p>
      <div class="face">
        {#if last}
          <span class="big">{airtime(last.endTime - last.startTime)}</span>
          <span class="unit">{last.pilot}, {day(last.date)}</span>
        {:else}
          <span class="unit">No flight loaded yet</span>
        {/if}
      </div>
      <span class="go">{last ? 'Replay last flight' : 'Pick flights'}</span>
    </a>

    <a class="tool" href="/logbook">
      <h2>Logbook</h2>
      <p>Every saved flight with airtime per month. Pick flights to replay together.</p>
      <div class="face">
        <svg class="bars" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label="Hours per month, last 12 months">
          {#each months as m, i (m.month)}
            <rect x={i * 10 + 1} width="8" y={32 - (m.hours / peak) * 30 - 2} height={(m.hours / peak) * 30 + 2} class:now={i === months.length - 1}>
              <title>{monthFmt.format(new Date(m.month + '-01'))}: {m.hours.toFixed(1)} h</title>
            </rect>
          {/each}
        </svg>
        <span class="unit">hours per month, last 12</span>
      </div>
      <span class="go">Open logbook</span>
    </a>

    <a class="tool" href="/convert">
      <h2>Convert</h2>
      <p>Turn a track into the format another app or instrument reads.</p>
      <div class="face"><span class="unit">IGC GPX KML FIT GeoJSON</span></div>
      <span class="go">Convert a file</span>
    </a>

    <a class="tool" href="/plan">
      <h2>XC planner</h2>
      <p>Draw a route on the map, score it per league and share the link.</p>
      <div class="face"><span class="unit">Distance, XC points, duration</span></div>
      <span class="go">Plan a route</span>
    </a>
  </section>

  <Dropzone {onfiles} {busy} compact />
  {#if errors.length}
    <ul class="errors">
      {#each errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}

  <section class="recent">
    <h2>Recent flights</h2>
    {#if !ready}
      <p class="muted">Reading saved flights…</p>
    {:else if flights.length}
      <ol>
        {#each flights.slice(0, 5) as f (f.id)}
          <li>
            <a href={f.manual ? '/logbook' : replayHref([f.id])}>
              <span class="date">{day(f.date)}</span>
              <span class="pilot">{f.pilot}</span>
              <span class="muted">{f.site ?? f.glider ?? ''}</span>
              <span class="dur">{airtime(f.endTime - f.startTime)}</span>
            </a>
          </li>
        {/each}
      </ol>
      {#if flights.length > 5}<a class="more" href="/logbook">All {flights.length} flights in the logbook</a>{/if}
    {:else}
      <p class="muted">
        No flights saved in this browser. Drop a flight file below, or
        <button onclick={loadDemo} disabled={busy}>load demo flights</button>
      </p>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 1040px;
    margin: 0 auto;
    padding: 28px 16px 48px;
    display: grid;
    gap: 24px;
  }
  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }
  .readouts {
    display: flex;
    gap: 28px;
    margin: 0;
  }
  .readouts div {
    display: grid;
    justify-items: end;
  }
  .readouts dt {
    order: 2;
    color: var(--muted);
    font-size: 12px;
  }
  .readouts dd {
    margin: 0;
    font: 500 34px/1 var(--display);
    font-variant-numeric: tabular-nums;
  }

  .tools {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  .tool {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    gap: 8px;
    padding: 16px 16px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    /* Inner bezel, like the rim of an instrument face. */
    box-shadow: inset 0 0 0 4px var(--bg), inset 0 0 0 5px var(--border);
    color: var(--text);
    text-decoration: none;
  }
  a.tool:hover {
    border-color: #4a505a;
  }
  a.tool:hover .go {
    color: var(--needle);
  }
  .tool h2 {
    margin: 0;
    font: 600 24px/1 var(--display);
  }
  .tool p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .face {
    display: grid;
    align-content: end;
    gap: 2px;
    min-height: 64px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg);
  }
  .big {
    font: 500 32px/1 var(--display);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    color: var(--muted);
    font-size: 12px;
  }
  .bars {
    width: 100%;
    height: 36px;
  }
  .bars rect {
    fill: #3a414c;
  }
  .bars rect.now {
    fill: var(--needle);
  }
  .go {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .recent h2 {
    margin: 0 0 8px;
    font: 600 20px/1 var(--display);
  }
  .recent ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .recent li a {
    display: grid;
    grid-template-columns: 110px 1fr 1fr auto;
    gap: 12px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
  }
  .recent li a:hover .pilot {
    color: var(--needle);
  }
  .pilot {
    font-weight: 600;
  }
  .dur,
  .date {
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--muted);
  }
  .more {
    display: inline-block;
    margin-top: 8px;
    color: var(--text);
  }
  .errors {
    margin: 0;
    color: var(--danger);
  }
  @media (max-width: 600px) {
    header {
      flex-direction: column;
      align-items: start;
    }
    .recent li a {
      grid-template-columns: 90px 1fr auto;
    }
    .recent li a .muted {
      display: none;
    }
  }
</style>

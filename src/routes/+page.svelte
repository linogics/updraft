<script lang="ts">
  import { onMount } from 'svelte';
  import { getLocale } from '#lib/paraglide/runtime';
  import { goto } from '$app/navigation';
  import Dropzone from '#lib/components/Dropzone.svelte';
  import LanguageSelect from '#lib/components/LanguageSelect.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { buildDemoFlights } from '#lib/demo/demoFlights';
  import { monthlyHours, totals } from '#lib/domain/logbook';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { importFlights, studioHref } from '#lib/storage/importFlights';
  import { m } from '#lib/paraglide/messages';
  import { formatAirtime, formatNumber } from '#lib/ui/format';

  let flights = $state<FlightSummary[]>([]);
  let ready = $state(false);
  let busy = $state(false);
  let errors = $state<string[]>([]);

  const HELP_URL = 'https://github.com/linogics/updraft/blob/main/docs/help.md';
  const sum = $derived(totals(flights));
  const months = $derived(monthlyHours(flights, 12, new Date()));
  const peak = $derived(Math.max(1, ...months.map((m) => m.hours)));
  // Manual logbook entries have no track to play back.
  const last = $derived(flights.find((f) => !f.manual));

  const dateFmt = new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(getLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const day = (date: string) => dateFmt.format(new Date(date));
  const airtime = formatAirtime;
  const hours = (seconds: number) => formatNumber(seconds / 3600, seconds < 36_000 ? 1 : 0);

  onMount(async () => {
    // Chromium: track files opened with the installed app arrive here (file_handlers in the manifest).
    window.launchQueue?.setConsumer(async (params) => {
      onfiles(await Promise.all(params.files.map((handle) => handle.getFile())));
    });
    flights = await flightRepository.list();
    ready = true;
  });

  async function onfiles(files: File[]) {
    busy = true;
    const result = await importFlights(files);
    busy = false;
    errors = result.errors;
    if (result.ids.length && !errors.length) goto(studioHref(result.ids));
    else flights = await flightRepository.list();
  }

  async function loadDemo() {
    busy = true;
    const demo = buildDemoFlights();
    for (const f of demo) await flightRepository.save(f);
    goto(studioHref(demo.map((f) => f.id)));
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
        <dt>{m.home_hours_flown()}</dt>
        <dd>{ready ? hours(sum.seconds) : '–'}</dd>
      </div>
      <div>
        <dt>{m.home_flights()}</dt>
        <dd>{ready ? sum.flights : '–'}</dd>
      </div>
    </dl>
    <div class="meta">
      <LanguageSelect />
      <a class="help" href={HELP_URL} target="_blank" rel="noreferrer" title={m.home_help()} aria-label={m.home_help()}>
        ?
      </a>
    </div>
  </header>

  <section class="tools" aria-label={m.home_tools()}>
    <a class="tool" href={last ? studioHref([last.id]) : '/logbook'}>
      <h2>{m.home_studio_title()}</h2>
      <p>{m.home_studio_desc()}</p>
      <div class="face">
        {#if last}
          <span class="big">{airtime(last.endTime - last.startTime)}</span>
          <span class="unit">{last.pilot}, {day(last.date)}</span>
        {:else}
          <span class="unit">{m.home_no_flight()}</span>
        {/if}
      </div>
      <span class="go">{last ? m.home_studio_last() : m.home_pick_flights()}</span>
    </a>

    <a class="tool" href="/logbook">
      <h2>{m.home_logbook_title()}</h2>
      <p>{m.home_logbook_desc()}</p>
      <div class="face">
        <svg class="bars" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label={m.home_bars_label()}>
          {#each months as m, i (m.month)}
            <rect
              x={i * 10 + 1}
              width="8"
              y={32 - (m.hours / peak) * 30 - 2}
              height={(m.hours / peak) * 30 + 2}
              class:now={i === months.length - 1}
            >
              <title>{monthFmt.format(new Date(m.month + '-01'))}: {formatNumber(m.hours, 1)} h</title>
            </rect>
          {/each}
        </svg>
        <span class="unit">{m.home_bars_caption()}</span>
      </div>
      <span class="go">{m.home_open_logbook()}</span>
    </a>

    <a class="tool" href="/convert">
      <h2>{m.home_convert_title()}</h2>
      <p>{m.home_convert_desc()}</p>
      <div class="face"><span class="unit">IGC GPX KML FIT GeoJSON</span></div>
      <span class="go">{m.home_convert_go()}</span>
    </a>

    <a class="tool" href="/plan">
      <h2>{m.home_planner_title()}</h2>
      <p>{m.home_planner_desc()}</p>
      <div class="face"><span class="unit">{m.home_planner_units()}</span></div>
      <span class="go">{m.home_planner_go()}</span>
    </a>
  </section>

  <Dropzone {onfiles} {busy} compact />
  {#if errors.length}
    <ul class="errors">
      {#each errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}

  <section class="recent">
    <h2>{m.home_recent()}</h2>
    {#if !ready}
      <p class="muted">{m.home_reading()}</p>
    {:else if flights.length}
      <ol>
        {#each flights.slice(0, 5) as f (f.id)}
          <li>
            <a href={f.manual ? '/logbook' : studioHref([f.id])}>
              <span class="date">{day(f.date)}</span>
              <span class="pilot">{f.pilot}</span>
              <span class="muted">{f.site ?? f.glider ?? ''}</span>
              <span class="dur">{airtime(f.endTime - f.startTime)}</span>
            </a>
          </li>
        {/each}
      </ol>
      {#if flights.length > 5}<a class="more" href="/logbook">{m.home_all_flights({ count: flights.length })}</a>{/if}
    {:else}
      <p class="muted">
        {m.home_no_flights()}
        <button onclick={loadDemo} disabled={busy}>{m.home_load_demo()}</button>
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
  .meta {
    display: flex;
    gap: 8px;
  }
  .help {
    display: grid;
    place-items: center;
    width: 30px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .help:hover {
    border-color: var(--border-hi);
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
    box-shadow:
      inset 0 0 0 4px var(--bg),
      inset 0 0 0 5px var(--border);
    color: var(--text);
    text-decoration: none;
  }
  a.tool:hover {
    border-color: var(--border-hi);
  }
  a.tool:hover .go {
    color: var(--primary-hi);
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
    fill: var(--border-hi);
  }
  .bars rect.now {
    fill: var(--primary);
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
    color: var(--primary-hi);
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

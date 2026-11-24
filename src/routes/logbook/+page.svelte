<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Backup from '#lib/components/logbook/Backup.svelte';
  import BarChart from '#lib/components/logbook/BarChart.svelte';
  import Dropzone from '#lib/components/Dropzone.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { buildDemoFlights } from '#lib/demo/demoFlights';
  import { breakdown, monthlyHours, totals, totalXcPoints, yearlyHours } from '#lib/domain/logbook';
  import { scoreFlight } from '#lib/xc/score';
  import type { XcScore } from '#lib/xc/types';
  import { XC_LEAGUES, type XcLeague } from '#lib/state/xcPrefs';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { importFlights, studioHref } from '#lib/storage/importFlights';
  import { m } from '#lib/paraglide/messages';
  import { getLocale } from '#lib/paraglide/runtime';
  import { formatAirtime, formatNumber } from '#lib/ui/format';
  import { formatAlt, formatDistance } from '#lib/ui/units';

  let flights = $state<FlightSummary[]>([]);
  let selected = $state<string[]>([]);
  let errors = $state<string[]>([]);
  let busy = $state(false);
  let ready = $state(false);
  // Missing id = not scored yet, null = nothing scorable or failed.
  let xc = $state<Record<string, XcScore | null>>({});
  let xcRun = 0;
  let by = $state<'year' | 'site' | 'glider'>('year');

  let editing = $state<string | null>(null);
  let draft = $state({ pilot: '', site: '', glider: '', notes: '' });
  let adding = $state(false);
  let manual = $state({
    date: new Date().toISOString().slice(0, 10),
    durationMin: 60,
    pilot: '',
    site: '',
    glider: '',
    notes: ''
  });

  const u = $derived(unitPrefs.units);
  const sum = $derived(totals(flights));
  const longest = $derived(Math.max(0, ...flights.map((f) => f.endTime - f.startTime)));
  const highest = $derived(Math.max(0, ...flights.map((f) => f.maxAlt ?? 0)));
  const monthFmt = new Intl.DateTimeFormat(getLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const months = $derived(
    monthlyHours(flights, 12, new Date()).map((m) => ({
      label: monthFmt.format(new Date(m.month + '-01')),
      hours: m.hours
    }))
  );
  const years = $derived(yearlyHours(flights).map((y) => ({ label: y.year, hours: y.hours })));
  const points = $derived(Object.fromEntries(Object.entries(xc).flatMap(([id, s]) => (s ? [[id, s.points]] : []))));
  const rows = $derived(breakdown(flights, by, points));
  const xcTotal = $derived(totalXcPoints(flights, points));
  const todo = $derived(flights.filter((f) => !f.manual));
  const scored = $derived(todo.filter((f) => f.id in xc).length);
  const TYPES = {
    free: () => m.logbook_xc_short_free(),
    flat: () => m.logbook_xc_short_flat(),
    fai: () => m.logbook_xc_short_fai(),
    oar: () => m.logbook_xc_short_oar()
  };
  const BY_LABELS = {
    year: () => m.logbook_by_year(),
    site: () => m.logbook_by_site(),
    glider: () => m.logbook_by_glider()
  };

  const hours = (seconds: number) => formatNumber(seconds / 3600, seconds < 36_000 ? 1 : 0);
  const mins = (min: number) => formatAirtime(min * 60_000);
  const dur = (f: FlightSummary) => formatAirtime(f.endTime - f.startTime);

  async function refresh() {
    flights = await flightRepository.list();
    selected = selected.filter((id) => flights.some((f) => f.id === id));
    ready = true;
    void scoreMissing();
  }

  /** Loads cached scores first, then scores the rest one flight at a time. A newer run supersedes this one. */
  async function scoreMissing(reset = false) {
    const run = ++xcRun;
    const league = xcPrefs.league;
    if (reset) xc = {};
    const missing = [];
    for (const f of flights.filter((f) => !f.manual && !(f.id in xc))) {
      let score: XcScore | null | undefined;
      try {
        score = await flightRepository.getXcScore(f.id, league);
      } catch (err) {
        console.error('Could not read XC score', err);
      }
      if (run !== xcRun) return;
      if (score === undefined) missing.push(f.id);
      else xc[f.id] = score;
    }
    for (const id of missing) {
      let score: XcScore | null;
      try {
        const flight = await flightRepository.get(id);
        score = flight ? await scoreFlight(flight.fixes, league) : null;
        await flightRepository.putXcScore(id, league, score);
      } catch (err) {
        console.error('Could not score flight', err);
        score = null;
      }
      if (run !== xcRun) return;
      xc[id] = score;
    }
  }

  function setLeague(league: XcLeague) {
    xcPrefs.set(league);
    void scoreMissing(true);
  }

  const openStudio = (ids: string[]) => goto(studioHref(ids));

  async function importFiles(files: File[]) {
    busy = true;
    const result = await importFlights(files);
    errors = result.errors;
    busy = false;
    await refresh();
    if (result.ids.length && errors.length === 0) openStudio(result.ids);
  }

  async function loadDemo() {
    const demo = buildDemoFlights();
    for (const f of demo) await flightRepository.save(f);
    openStudio(demo.map((f) => f.id));
  }

  async function remove(f: FlightSummary) {
    if (!confirm(m.logbook_confirm_delete({ pilot: f.pilot, date: f.date }))) return;
    await flightRepository.delete(f.id);
    await refresh();
  }

  function edit(f: FlightSummary) {
    editing = f.id;
    draft = { pilot: f.pilot, site: f.site ?? '', glider: f.glider ?? '', notes: f.notes ?? '' };
  }

  async function saveEdit() {
    if (!editing) return;
    await flightRepository.updateMeta(editing, {
      pilot: draft.pilot.trim() || 'Unknown',
      site: draft.site.trim() || null,
      glider: draft.glider.trim() || null,
      notes: draft.notes
    });
    editing = null;
    await refresh();
  }

  async function addManual(e: SubmitEvent) {
    e.preventDefault();
    await flightRepository.saveManual({
      date: manual.date,
      durationMin: manual.durationMin,
      pilot: manual.pilot.trim() || 'Unknown',
      site: manual.site.trim() || null,
      glider: manual.glider.trim() || null,
      notes: manual.notes
    });
    adding = false;
    await refresh();
  }

  onMount(refresh);
  onDestroy(() => xcRun++);
</script>

<svelte:head>
  <title>{m.logbook_title()}</title>
</svelte:head>

<main>
  <header>
    <div>
      <Logo />
      <h1>{m.home_logbook_title()}</h1>
    </div>
    <dl class="readouts" aria-busy={!ready}>
      <div>
        <dt>{m.home_hours_flown()}</dt>
        <dd>{ready ? hours(sum.seconds) : '–'}</dd>
      </div>
      <div>
        <dt>{m.home_flights()}</dt>
        <dd>{ready ? sum.flights : '–'}</dd>
      </div>
      <div>
        <dt>{m.logbook_xc_points()}</dt>
        <dd>{ready ? formatNumber(xcTotal, 2) : '–'}</dd>
      </div>
      <div>
        <dt>{m.logbook_longest()}</dt>
        <dd>{ready && longest ? formatAirtime(longest) : '–'}</dd>
      </div>
      <div>
        <dt>{m.logbook_highest()}</dt>
        <dd>{ready && highest ? formatAlt(highest, u) : '–'}</dd>
      </div>
    </dl>
  </header>

  {#if flights.length}
    <section class="charts">
      <BarChart bars={months} label={m.home_bars_label()} />
      <BarChart bars={years} label={m.logbook_hours_per_year()} />
    </section>

    <section>
      <div class="head">
        <h2>{m.logbook_breakdown()}</h2>
        <div class="seg" role="group" aria-label={m.logbook_group_by()}>
          {#each ['year', 'site', 'glider'] as const as k (k)}
            <button class:on={by === k} aria-pressed={by === k} onclick={() => (by = k)}>{BY_LABELS[k]()}</button>
          {/each}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>{BY_LABELS[by]()}</th><th class="num">{m.logbook_col_flights()}</th><th class="num">
              {m.logbook_col_hours()}
            </th><th class="num">{m.logbook_col_points()}</th><th class="num hide">{m.logbook_col_longest()}</th><th
              class="num hide"
            >
              {m.export_row_max_altitude()}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.label)}
            <tr>
              <td>{r.label}</td>
              <td class="num">{r.flights}</td>
              <td class="num">{formatNumber(r.hours, 1)}</td>
              <td class="num">{formatNumber(r.points, 2)}</td>
              <td class="num hide">{mins(r.longestMin)}</td>
              <td class="num hide">{r.maxAlt === undefined ? '–' : formatAlt(r.maxAlt, u)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <Dropzone onfiles={importFiles} {busy} />
  {#if errors.length}
    <ul class="errors">
      {#each errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}
  {#if ready && !flights.length}
    <p class="muted">{m.logbook_no_igc()} <button onclick={loadDemo}>{m.logbook_load_demo()}</button></p>
  {/if}

  <section>
    <div class="head">
      <h2>{m.logbook_col_flights()}</h2>
      <div class="actions">
        <label class="league">
          {m.xc_league()}
          <select value={xcPrefs.league} onchange={(e) => setLeague(e.currentTarget.value as XcLeague)}>
            {#each XC_LEAGUES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
          </select>
        </label>
        {#if ready && scored < todo.length}<span class="muted">
            {m.logbook_scoring({ scored, total: todo.length })}
          </span>{/if}
        <button onclick={() => (adding = !adding)} aria-expanded={adding}>{m.logbook_add_manual()}</button>
        <button disabled={!selected.length} onclick={() => openStudio(selected)}>
          {m.logbook_studio_selected({ count: selected.length })}
        </button>
      </div>
    </div>

    {#if adding}
      <form class="form" onsubmit={addManual}>
        <label>{m.export_row_date()} <input type="date" required bind:value={manual.date} /></label>
        <label>
          {m.logbook_duration_min()} <input type="number" min="1" required bind:value={manual.durationMin} />
        </label>
        <label>{m.export_row_pilot()} <input bind:value={manual.pilot} /></label>
        <label>{m.export_row_site()} <input bind:value={manual.site} /></label>
        <label>{m.export_row_glider()} <input bind:value={manual.glider} /></label>
        <label class="wide">{m.logbook_col_notes()} <textarea rows="2" bind:value={manual.notes}></textarea></label>
        <div class="actions">
          <button type="submit">{m.common_save()}</button><button type="button" onclick={() => (adding = false)}>
            {m.common_cancel()}
          </button>
        </div>
      </form>
    {/if}

    {#if flights.length}
      <table>
        <thead>
          <tr>
            <th><span class="sr">{m.logbook_col_select()}</span></th><th>{m.export_row_date()}</th><th>
              {m.export_row_pilot()}
            </th><th class="hide">{m.export_row_site()}</th><th class="hide">{m.export_row_glider()}</th>
            <th class="num">{m.export_row_duration()}</th><th class="num hide">{m.logbook_col_distance()}</th><th
              class="num hide"
            >
              {m.export_row_max_altitude()}
            </th><th class="hide">{m.logbook_col_xc_type()}</th><th class="num hide">{m.logbook_col_points()}</th><th>
              <span class="sr">{m.logbook_col_notes()}</span>
            </th><th><span class="sr">{m.logbook_col_actions()}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each flights as f (f.id)}
            <tr>
              <td>
                <input
                  type="checkbox"
                  value={f.id}
                  bind:group={selected}
                  disabled={f.manual}
                  aria-label={m.logbook_select_aria({ pilot: f.pilot, date: f.date })}
                />
              </td>
              <td>{f.date}</td>
              <td>
                {#if f.manual}{f.pilot}{:else}<a href={studioHref([f.id])}>{f.pilot}</a>{/if}
              </td>
              <td class="muted hide">{f.site ?? '–'}</td>
              <td class="muted hide">{f.glider ?? '–'}</td>
              <td class="num">{dur(f)}</td>
              <td class="num hide">{f.trackKm === undefined ? '–' : formatDistance(f.trackKm * 1000, u)}</td>
              <td class="num hide">{f.maxAlt === undefined ? '–' : formatAlt(f.maxAlt, u)}</td>
              <td class="hide">{f.manual ? '–' : !(f.id in xc) ? '…' : xc[f.id] ? TYPES[xc[f.id]!.type]() : '–'}</td>
              <td class="num hide">
                {f.manual ? '–' : !(f.id in xc) ? '…' : xc[f.id] ? formatNumber(xc[f.id]!.points, 2) : '–'}
              </td>
              <td title={f.notes}>
                {#if f.notes}<span aria-label={m.logbook_has_notes()}>✎</span>{/if}
              </td>
              <td class="actions">
                <button onclick={() => edit(f)} aria-label={m.logbook_edit_aria({ pilot: f.pilot, date: f.date })}>
                  {m.common_edit()}
                </button>
                <button onclick={() => remove(f)} aria-label={m.logbook_delete_aria({ pilot: f.pilot, date: f.date })}>
                  ✕
                </button>
              </td>
            </tr>
            {#if editing === f.id}
              <tr>
                <td colspan="12">
                  <form
                    class="form"
                    onsubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                  >
                    <label>{m.export_row_pilot()} <input bind:value={draft.pilot} /></label>
                    <label>{m.export_row_site()} <input bind:value={draft.site} /></label>
                    <label>{m.export_row_glider()} <input bind:value={draft.glider} /></label>
                    <label class="wide">
                      {m.logbook_col_notes()} <textarea rows="2" bind:value={draft.notes}></textarea>
                    </label>
                    <div class="actions">
                      <button type="submit">{m.common_save()}</button><button
                        type="button"
                        onclick={() => (editing = null)}
                      >
                        {m.common_cancel()}
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <Backup ondone={refresh} />
</main>

<style>
  main {
    max-width: 960px;
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
    flex-wrap: wrap;
  }
  h1 {
    margin: 12px 0 0;
    font: 600 32px/1.1 var(--display);
  }
  h2 {
    margin: 0;
    font: 600 20px/1 var(--display);
  }
  .readouts {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
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
    font: 500 30px/1 var(--display);
    font-variant-numeric: tabular-nums;
  }
  .charts {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .league {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .seg button.on {
    border-color: var(--primary-hi);
    color: var(--primary-hi);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    font-size: 12px;
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  td a {
    color: var(--text);
    font-weight: 600;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td.actions {
    justify-content: end;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
  }
  .errors {
    margin: 0;
    color: var(--danger);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    padding: 10px;
    margin-bottom: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .form label {
    display: grid;
    gap: 2px;
    font-size: 12px;
    color: var(--muted);
  }
  .form .wide,
  .form .actions {
    grid-column: 1 / -1;
  }
  .form input,
  .form textarea {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    width: 100%;
    min-width: 0;
  }
  @media (max-width: 700px) {
    .charts {
      grid-template-columns: 1fr;
    }
    .hide {
      display: none;
    }
  }
</style>

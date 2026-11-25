<script lang="ts">
  import { onMount } from 'svelte';
  import { clubStudioHref, type ValidClubEntry } from '#lib/club';
  import { formatCategory } from '#lib/club/format';
  import { CATEGORIES, rankings, type Category, type Medal } from '#lib/club/rankings';
  import { m } from '#lib/paraglide/messages';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { XC_LEAGUES } from '#lib/state/xcPrefs';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { syncClient } from '#lib/sync/client.svelte';
  import { formatAirtime, formatNumber } from '#lib/ui/format';
  import { formatDistance } from '#lib/ui/units';

  let entries = $state.raw<ValidClubEntry[]>([]);
  let loading = $state(true);
  let error = $state('');
  let view = $state<'rankings' | 'flights'>('rankings');
  // Owner id the Flights tab is limited to, empty for all pilots.
  let owner = $state('');

  const u = $derived(unitPrefs.units);
  const league = $derived(XC_LEAGUES.find((l) => l.id === xcPrefs.league)?.label ?? xcPrefs.league);
  const ranks = $derived(rankings(entries, xcPrefs.league));
  const byKey = $derived(new Map(entries.map((e) => [e.key, e])));
  const mine = $derived(new Set(entries.filter((e) => e.mine).map((e) => e.owner)));
  // Newest flight first, the date alone is not unique, so the server order breaks ties.
  const newest = $derived(
    [...entries]
      .filter((e) => !owner || e.owner === owner)
      .reverse()
      .sort((a, b) => b.stats.date.localeCompare(a.stats.date))
  );
  const ownerName = $derived(entries.find((e) => e.owner === owner)?.stats.pilot ?? '');

  const TITLES: Record<Category, () => string> = {
    xcPoints: () => m.club_cat_xc_points({ league }),
    freeDistance: () => m.club_cat_free_distance(),
    xcSpeed: () => m.club_cat_xc_speed(),
    longestFlight: () => m.club_cat_longest_flight(),
    totalAirtime: () => m.club_cat_total_airtime(),
    mostFlights: () => m.club_cat_most_flights(),
    maxAltMsl: () => m.club_cat_max_alt(),
    maxGain: () => m.club_cat_max_gain(),
    maxAgl: () => m.club_cat_max_agl(),
    bestClimb: () => m.club_cat_best_climb(),
    bestThermalGain: () => m.club_cat_best_gain()
  };
  const MEDALS: Record<Medal, () => string> = {
    gold: () => m.club_medal_gold(),
    silver: () => m.club_medal_silver(),
    bronze: () => m.club_medal_bronze()
  };
  const VIEWS = {
    rankings: () => m.club_tab_rankings(),
    flights: () => m.club_tab_flights()
  };

  async function load() {
    loading = true;
    error = '';
    try {
      await syncClient.init();
      if (syncClient.hasClub) entries = await syncClient.clubEntries();
    } catch (e) {
      error = m.club_error({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      loading = false;
    }
  }

  function showFlightsOf(o: string) {
    owner = o;
    view = 'flights';
  }

  onMount(() => void load());
</script>

<svelte:head>
  <title>{m.club_title()}</title>
</svelte:head>

<div class="club">
  <header>
    <h1>{m.club_title()}</h1>
    {#if syncClient.hasClub}
      <div class="bar">
        <div class="seg" role="group" aria-label={m.club_views()}>
          {#each ['rankings', 'flights'] as const as k (k)}
            <button class:on={view === k} aria-pressed={view === k} onclick={() => (view = k)}>{VIEWS[k]()}</button>
          {/each}
        </div>
        <button onclick={load} disabled={loading}>{m.club_refresh()}</button>
      </div>
    {/if}
  </header>

  <div role="alert">{error}</div>

  {#if !syncClient.ready || loading}
    <p class="muted" role="status">{m.club_loading()}</p>
  {:else if !syncClient.hasClub}
    <p class="muted">{m.home_club_signin()}</p>
  {:else if !entries.length}
    <p class="muted">{m.club_empty()}</p>
  {:else if view === 'rankings'}
    <p class="muted">{m.club_all_time()}</p>
    <div class="cards">
      {#each CATEGORIES.filter((c) => ranks[c].length) as cat (cat)}
        <section aria-labelledby="cat-{cat}">
          <h2 id="cat-{cat}">{TITLES[cat]()}</h2>
          <ol>
            {#each ranks[cat] as r (r.owner)}
              {@const e = r.entryKey ? byKey.get(r.entryKey) : undefined}
              <li>
                <span class="medal {r.medal}" role="img" aria-label={MEDALS[r.medal]()} title={MEDALS[r.medal]()}
                ></span>
                <span class="who">
                  <span>
                    {#if e}
                      <a href={clubStudioHref(e.key)}>{r.pilot}<span class="sr"> {e.stats.date}</span></a>
                    {:else}
                      <button class="link" onclick={() => showFlightsOf(r.owner)}>{r.pilot}</button>
                    {/if}{#if mine.has(r.owner)}<em>{m.club_you()}</em>{/if}
                  </span>
                  {#if e}<span class="muted">{e.stats.date}</span>{/if}
                </span>
                <strong>{formatCategory(cat, r.value, u)}</strong>
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {:else}
    {#if owner}
      <p class="filter">
        <span>{m.club_filter_pilot({ pilot: ownerName })}</span>
        <button onclick={() => (owner = '')}>{m.club_filter_clear()}</button>
      </p>
    {/if}
    <table>
      <thead>
        <tr>
          <th>{m.export_row_pilot()}</th><th>{m.export_row_date()}</th><th class="hide">{m.export_row_site()}</th>
          <th class="num">{m.export_row_duration()}</th><th class="num hide">{m.logbook_col_distance()}</th>
          <th class="num hide">{m.logbook_col_points()}</th>
        </tr>
      </thead>
      <tbody>
        {#each newest as e (e.key)}
          <tr>
            <td>
              <a href={clubStudioHref(e.key)}>{e.stats.pilot}<span class="sr"> {e.stats.date}</span></a>{#if e.mine}<em>
                  {m.club_you()}
                </em>{/if}
            </td>
            <td>{e.stats.date}</td>
            <td class="muted hide">{e.stats.site ?? '–'}</td>
            <td class="num">{formatAirtime(e.stats.durationS * 1000)}</td>
            <td class="num hide">{formatDistance(e.stats.freeDistanceKm * 1000, u)}</td>
            <td class="num hide">
              {e.stats.xc?.league === xcPrefs.league ? formatNumber(e.stats.xc.points, 2) : '–'}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .club {
    display: grid;
    gap: 16px;
  }
  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  td a,
  li a {
    color: var(--text);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
  }
  h1 {
    margin: 0;
    font: 600 32px/1.1 var(--display);
  }
  h2 {
    margin: 0 0 8px;
    font: 600 18px/1.1 var(--display);
  }
  .bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
  [role='alert'] {
    color: var(--danger);
  }
  [role='alert']:empty {
    display: none;
  }
  .muted {
    color: var(--muted);
    margin: 0;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 12px;
  }
  section {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  ol {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
  }
  .who {
    display: grid;
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .who .muted {
    font-size: 12px;
    font-weight: 400;
  }
  strong {
    font: 500 16px/1 var(--display);
    font-variant-numeric: tabular-nums;
  }
  em {
    margin-left: 6px;
    padding: 1px 6px;
    border: 1px solid var(--primary-hi);
    border-radius: 999px;
    color: var(--primary-hi);
    font-size: 11px;
    font-style: normal;
    font-weight: 500;
  }
  /* The label carries the meaning, the color only decorates. */
  .medal {
    width: 18px;
    height: 18px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--border-hi);
  }
  .gold {
    background: var(--needle);
  }
  .silver {
    background: color-mix(in srgb, var(--text) 70%, var(--surface));
  }
  .bronze {
    background: color-mix(in srgb, var(--warn) 55%, #5a3418);
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
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @media (forced-colors: active) {
    .medal {
      forced-color-adjust: none;
    }
  }
  @media (max-width: 700px) {
    .hide {
      display: none;
    }
  }
</style>

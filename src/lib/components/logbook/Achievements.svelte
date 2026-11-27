<script lang="ts">
  import Medal from '@lucide/svelte/icons/medal';

  import { countsForBadges, localBadgeItems } from '#lib/badges/local';
  import { type BadgeItem, badgeProgress, TIERS } from '#lib/badges/progress';
  import { type BadgeGroup, BUILTIN_BADGE_PLUGIN, loadBadgeGroups } from '#lib/badges/registry';
  import AddPluginDialog from '#lib/components/studio/AddPluginDialog.svelte';
  import { announce } from '#lib/components/studio/panelActions.svelte';
  import { m } from '#lib/paraglide/messages';
  import { removePlugin } from '#lib/plugins/actions';
  import type { BadgeDef } from '#lib/plugins/badgeKind';
  import type { PluginEntry } from '#lib/plugins/entries';
  import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { studioHref } from '#lib/storage/importFlights';
  import { flash, scrollToSelector, sortByName } from '#lib/ui/attention';
  import { formatAirtime, formatDate, formatNumber } from '#lib/ui/format';
  import { formatAlt, formatDistance, formatSpeed, formatVario } from '#lib/ui/units';

  let { flights }: { flights: FlightSummary[] } = $props();

  let groups = $state.raw<BadgeGroup[]>([]);
  // Null until the first run is done, so the cards do not flash as locked.
  let items = $state.raw<BadgeItem<string>[] | null>(null);
  let analysing = $state<{ done: number; total: number } | null>(null);
  let addDialog: AddPluginDialog;
  let addButton = $state<HTMLButtonElement>();

  const u = $derived(unitPrefs.units);
  const installed = $derived(
    sortByName(
      pluginPrefs.list.filter((e) => e.kind === 'badge'),
      (e) => e.name
    )
  );

  const TIER_LABELS = {
    bronze: () => m.tier_bronze(),
    silver: () => m.tier_silver(),
    gold: () => m.tier_gold(),
    platinum: () => m.tier_platinum(),
    diamond: () => m.tier_diamond(),
    cloudbase: () => m.tier_cloudbase(),
    stratos: () => m.tier_stratos(),
    legend: () => m.tier_legend()
  };
  // Only the bundled plugin is translated, a plugin brings its own label.
  const BADGE_LABELS: Record<string, () => string> = {
    'free-distance': () => m.badge_free_distance(),
    'xc-speed': () => m.badge_xc_speed(),
    'longest-flight': () => m.badge_longest_flight(),
    'total-airtime': () => m.badge_total_airtime(),
    flights: () => m.badge_flights(),
    'max-altitude': () => m.badge_max_altitude(),
    'max-gain': () => m.badge_max_gain(),
    'max-agl': () => m.badge_max_agl(),
    'best-climb': () => m.badge_best_climb(),
    'best-thermal-gain': () => m.badge_best_thermal_gain(),
    sites: () => m.badge_sites(),
    'biggest-triangle': () => m.badge_biggest_triangle(),
    triangles: () => m.badge_triangles(),
    'flight-days': () => m.badge_flight_days(),
    gliders: () => m.badge_gliders()
  };

  const labelOf = (g: BadgeGroup, b: BadgeDef) =>
    (g.id === BUILTIN_BADGE_PLUGIN ? BADGE_LABELS[b.id]?.() : undefined) ?? b.label;

  function format(unit: BadgeDef['unit'], v: number): string {
    switch (unit) {
      case 'distance':
        return formatDistance(v, u);
      case 'speed':
        return formatSpeed(v, u);
      case 'duration':
        return formatAirtime(v * 1000);
      case 'altitude':
        return formatAlt(v, u);
      case 'vario':
        return formatVario(v, u);
      case 'count':
        return formatNumber(v);
    }
  }

  const cards = $derived(
    items
      ? groups.flatMap((g) =>
          g.badges.map((b) => ({ key: `${g.id}:${b.id}`, def: b, label: labelOf(g, b), p: badgeProgress(b, items!) }))
        )
      : []
  );

  $effect(() => {
    let current = true;
    void loadBadgeGroups(pluginPrefs.list).then((g) => current && (groups = g));
    return () => (current = false);
  });

  // Recomputed when the logbook or the league changes. A newer run supersedes this one.
  $effect(() => {
    let current = true;
    const total = flights.filter(countsForBadges).length;
    analysing = total ? { done: 0, total } : null;
    void localBadgeItems(flights, xcPrefs.league, {
      repo: flightRepository,
      isCurrent: () => current,
      onProgress: (done) => (analysing = { done, total })
    }).then((list) => {
      if (!list) return;
      items = list;
      analysing = null;
    });
    return () => (current = false);
  });

  function onadded(e: PluginEntry) {
    flash(addButton);
    announce(m.plugin_added({ name: e.name }));
    return scrollToSelector(`[data-id="${CSS.escape(e.id)}"]`);
  }
</script>

<div class="achievements">
  {#if analysing}
    <p class="muted" role="status">{m.achievements_analysing(analysing)}</p>
  {/if}

  {#if items}
    <ul class="grid">
      {#each cards as { key, def, label, p } (key)}
        {@const tier = p.tier}
        {@const at = tier ? TIERS.indexOf(tier) : -1}
        <li class="card" class:locked={!tier} style:--tier="var(--tier-{tier ?? 'none'})">
          <Medal aria-hidden="true" size={28} />
          <div class="body">
            <span class="tier">{tier ? TIER_LABELS[tier]() : m.achievements_locked()}</span>
            <h3>{label}</h3>
            <p class="value">{p.value ? format(def.unit, p.value) : '–'}</p>
            <progress
              max="1"
              value={p.ratio}
              aria-label={m.achievements_progress({ tier: TIER_LABELS[TIERS[at + 1] ?? 'legend']() })}
            ></progress>
            <small class="muted">
              {p.next === null ? m.achievements_maxed() : m.achievements_next({ value: format(def.unit, p.next) })}
            </small>
            {#if tier && p.unlocked[at]}
              <small class="muted">
                {m.achievements_unlocked({ tier: TIER_LABELS[tier](), date: formatDate(p.unlocked[at]) })}
              </small>
            {/if}
            {#if p.ref}<a href={studioHref([p.ref])}>{m.achievements_flight()}</a>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <section class="plugins" aria-labelledby="badge-plugins">
    <h3 id="badge-plugins">{m.achievements_plugins()}</h3>
    {#if installed.length}
      <ul>
        {#each installed as e (e.id)}
          <li data-id={e.id}>
            <strong>{e.name}</strong>
            <button
              type="button"
              aria-label={m.plugin_uninstall_label({ name: e.name })}
              onclick={() => removePlugin(e.id)}
            >
              {m.plugin_uninstall()}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <button bind:this={addButton} type="button" onclick={() => addDialog.open()}>
      {m.achievements_add_plugin()}
    </button>
  </section>
</div>

<AddPluginDialog bind:this={addDialog} kinds={['badge']} {onadded} />

<style>
  .achievements {
    display: grid;
    gap: 16px;
    --tier-none: var(--border);
    --tier-bronze: #b87333;
    --tier-silver: #9aa4ae;
    --tier-gold: #e0a800;
    --tier-platinum: #5fb3c9;
    --tier-diamond: #3ea8f0;
    --tier-cloudbase: #6f86ff;
    --tier-stratos: #a46bf0;
    --tier-legend: #f0506e;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    display: flex;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--tier);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }
  .card > :global(svg) {
    flex: none;
    color: var(--tier);
  }
  .locked {
    opacity: 0.6;
  }
  .body {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .tier {
    color: var(--tier);
    font-size: 12px;
    font-weight: 600;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .value {
    margin: 0;
    font: 500 20px/1.2 var(--display);
    font-variant-numeric: tabular-nums;
  }
  progress {
    appearance: none;
    width: 100%;
    height: 6px;
    margin: 4px 0;
    border: 0;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }
  progress::-webkit-progress-bar {
    background: var(--border);
  }
  progress::-webkit-progress-value {
    background: var(--tier);
  }
  progress::-moz-progress-bar {
    background: var(--tier);
  }
  small {
    font-size: 12px;
  }
  .muted {
    color: var(--muted);
  }
  a {
    justify-self: start;
    font-size: 12px;
    color: var(--primary-hi);
  }
  .plugins {
    display: grid;
    justify-items: start;
    gap: 8px;
  }
  .plugins ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .plugins li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
</style>

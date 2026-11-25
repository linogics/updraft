<script lang="ts">
  import LanguageSelect from '#lib/components/LanguageSelect.svelte';
  import Logbook from '#lib/components/logbook/Logbook.svelte';
  import SideDrawer from '#lib/components/SideDrawer.svelte';
  import SidebarHeader from '#lib/components/SidebarHeader.svelte';
  import type { FlightSummary } from '#lib/storage';
  import { studioHref } from '#lib/storage/importFlights';
  import { syncClient } from '#lib/sync/client.svelte';
  import { m } from '#lib/paraglide/messages';

  const HELP_URL = 'https://github.com/linogics/updraft/blob/main/docs/help.md';

  let loaded = $state(false);
  // Manual logbook entries have no track to play back.
  let last = $state<FlightSummary>();

  function onchange(flights: FlightSummary[]) {
    last = flights.find((f) => !f.manual);
    loaded = true;
  }
</script>

<svelte:head>
  <title>updraft</title>
</svelte:head>

<div class="page">
  <SideDrawer label={m.home_tools()}>
    {#snippet header()}
      <SidebarHeader />
    {/snippet}

    <div class="side">
      <nav aria-label={m.home_tools()}>
        <ul>
          <li>
            {#if last}
              <a class="entry" href={studioHref([last.id])}>
                <strong>{m.home_studio_title()}</strong>
                <span>{m.home_studio_desc()}</span>
              </a>
            {:else}
              <span class="entry disabled" aria-disabled="true">
                <strong>{m.home_studio_title()}</strong>
                <span>{m.home_studio_desc()}</span>
                {#if loaded}<em>{m.home_no_flight()}</em>{/if}
              </span>
            {/if}
          </li>
          <li>
            {#if syncClient.hasClub}
              <a class="entry" href="/club">
                <strong>{m.home_club_title()}</strong>
                <span>{m.home_club_desc()}</span>
              </a>
            {:else}
              <span class="entry disabled" aria-disabled="true">
                <strong>{m.home_club_title()}</strong>
                <span>{m.home_club_desc()}</span>
                <em>{m.home_club_signin()}</em>
              </span>
            {/if}
          </li>
          <li>
            <a class="entry" href="/convert">
              <strong>{m.home_convert_title()}</strong>
              <span>{m.home_convert_desc()}</span>
            </a>
          </li>
          <li>
            <a class="entry" href="/plan">
              <strong>{m.home_planner_title()}</strong>
              <span>{m.home_planner_desc()}</span>
            </a>
          </li>
        </ul>
      </nav>

      <div class="meta">
        <LanguageSelect />
        <a
          class="help"
          href={HELP_URL}
          target="_blank"
          rel="noreferrer"
          title={m.home_help()}
          aria-label={m.home_help()}
        >
          ?
        </a>
      </div>
    </div>
  </SideDrawer>

  <main>
    <Logbook {onchange} />
  </main>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
    min-height: 100dvh;
  }
  main {
    width: 100%;
    max-width: 1000px;
    padding: 28px 24px 48px;
    justify-self: center;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100%;
    padding: 16px;
  }
  ul {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
    display: grid;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
    /* Inner bezel, like the rim of an instrument face. */
    box-shadow:
      inset 0 0 0 3px var(--surface),
      inset 0 0 0 4px var(--border);
    color: var(--text);
    text-decoration: none;
  }
  .entry strong {
    font: 600 18px/1.1 var(--display);
  }
  .entry span,
  .entry em {
    color: var(--muted);
    font-size: 12px;
    font-style: normal;
  }
  .entry em {
    color: var(--warn);
  }
  a.entry:hover,
  a.entry:focus-visible {
    border-color: var(--border-hi);
    background: var(--bg);
  }
  a.entry:hover strong,
  a.entry:focus-visible strong {
    color: var(--primary-hi);
  }
  .disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .meta {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }
  .meta :global(select) {
    flex: 1;
    min-width: 0;
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

  @media (max-width: 800px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      min-height: 0;
    }
    main {
      padding: 20px 16px 40px;
    }
  }
</style>

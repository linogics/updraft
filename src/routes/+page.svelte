<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Dropzone from '#lib/components/Dropzone.svelte';
  import { buildDemoFlights } from '#lib/demo/demoFlights';
  import { parseIgc } from '#lib/domain/igc';
  import { DEFAULT_SCENE, encodeScene } from '#lib/domain/scene';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let flights = $state<FlightSummary[]>([]);
  let selected = $state<string[]>([]);
  let errors = $state<string[]>([]);
  let busy = $state(false);

  async function refresh() {
    flights = await flightRepository.list();
  }

  function openReplay(ids: string[]) {
    goto(`/replay?${encodeScene({ ...DEFAULT_SCENE, flightIds: ids })}`);
  }

  async function importFiles(files: File[]) {
    busy = true;
    errors = [];
    const ids: string[] = [];
    for (const file of files) {
      try {
        const flight = parseIgc(await file.text(), { id: crypto.randomUUID(), sourceName: file.name });
        await flightRepository.save(flight);
        ids.push(flight.id);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    busy = false;
    await refresh();
    if (ids.length && errors.length === 0) openReplay(ids);
  }

  async function loadDemo() {
    const demo = buildDemoFlights();
    for (const f of demo) await flightRepository.save(f);
    openReplay(demo.map((f) => f.id));
  }

  async function remove(id: string) {
    await flightRepository.delete(id);
    selected = selected.filter((s) => s !== id);
    await refresh();
  }

  onMount(refresh);
</script>

<main>
  <header>
    <h1>Paragliding Replay</h1>
    <p>Replay and analyse IGC flights in 3D: thermals, glides, stats and group comparison.</p>
  </header>

  <Dropzone onfiles={importFiles} {busy} />
  {#if errors.length}
    <ul class="errors">
      {#each errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}
  <p class="demo">No IGC file at hand? <button onclick={loadDemo}>Load demo flights</button></p>

  {#if flights.length}
    <section>
      <div class="list-head">
        <h3>Saved flights</h3>
        <button disabled={!selected.length} onclick={() => openReplay(selected)}>
          Replay selected ({selected.length})
        </button>
      </div>
      <table>
        <thead>
          <tr><th></th><th>Date</th><th>Pilot</th><th>Glider</th><th>Takeoff</th><th>Duration</th><th></th></tr>
        </thead>
        <tbody>
          {#each flights as f (f.id)}
            <tr>
              <td><input type="checkbox" value={f.id} bind:group={selected} aria-label="Select {f.pilot}" /></td>
              <td>{f.date}</td>
              <td><a href="/replay?{encodeScene({ ...DEFAULT_SCENE, flightIds: [f.id] })}">{f.pilot}</a></td>
              <td class="muted">{f.glider ?? '–'}</td>
              <td>{formatClock(f.startTime)}</td>
              <td>{formatDuration((f.endTime - f.startTime) / 1000)}</td>
              <td><button class="delete" onclick={() => remove(f.id)} aria-label="Delete {f.pilot}">✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 16px;
    display: grid;
    gap: 20px;
  }
  h1 {
    margin: 0;
  }
  header p {
    margin: 4px 0 0;
    color: var(--muted);
  }
  .demo {
    margin: 0;
    color: var(--muted);
  }
  .errors {
    margin: 0;
    color: var(--danger);
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .list-head h3 {
    margin: 0;
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
  .muted {
    color: var(--muted);
  }
  .delete {
    padding: 2px 8px;
  }
  @media (max-width: 600px) {
    th:nth-child(4),
    td:nth-child(4) {
      display: none;
    }
  }
</style>

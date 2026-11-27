<script lang="ts">
  import { onMount } from 'svelte';

  import { m } from '#lib/paraglide/messages';
  import type { ServiceSchema } from '#lib/plugins/api';
  import { coreSchemas } from '#lib/plugins/coreSchemas';
  import { services } from '#lib/plugins/services';
  import { typeText } from '#lib/plugins/typeText';

  interface Entry {
    schema: ServiceSchema;
    /** Plugin id, or empty for the app. */
    owner: string;
  }

  const core: Entry[] = coreSchemas.map((schema) => ({ schema, owner: '' }));
  let installed = $state.raw<Entry[]>([]);

  // The registry is plain state, read once when the page opens. Core schemas show without the studio.
  onMount(() => {
    installed = services
      .list()
      .filter((s) => s.schema && s.owner !== 'updraft' && !s.owner.startsWith('updraft/'))
      .map((s) => ({ schema: s.schema!, owner: s.owner }));
  });

  const entries = $derived([...core, ...installed].sort((a, b) => a.schema.name.localeCompare(b.schema.name)));
</script>

<svelte:head><title>{m.api_title()}</title></svelte:head>

<div class="api">
  <header>
    <h1>{m.api_title()}</h1>
    <p>{m.api_intro()}</p>
  </header>

  {#each entries as { schema, owner } (schema.name)}
    <section aria-labelledby="svc-{schema.name}">
      <h2 id="svc-{schema.name}">{schema.name}</h2>
      <p class="muted">{owner ? m.api_provider_plugin({ id: owner }) : m.api_provider_app()}</p>
      <p>{schema.description}</p>

      {#if schema.events}
        <h3>{m.api_events()}</h3>
        <dl>
          {#each Object.entries(schema.events) as [event, e] (event)}
            <dt><code>{event}</code></dt>
            <dd>{e.description}</dd>
          {/each}
        </dl>
      {/if}

      <h3>{m.api_methods()}</h3>
      <ul class="methods">
        {#each Object.entries(schema.methods) as [name, method] (name)}
          <li>
            <div class="sig">
              <code class="name">{name}</code>
              <span class="badge {method.access}">{method.access === 'write' ? m.api_write() : m.api_read()}</span>
            </div>
            <p>{method.description}</p>
            <dl>
              <dt>{m.api_params()}</dt>
              <dd>
                {#if method.params.length}
                  {#each method.params as p (p.name)}
                    <code>{p.name}{p.optional ? '?' : ''}: {typeText(p.schema)}</code>
                  {/each}
                {:else}
                  {m.api_none()}
                {/if}
              </dd>
              <dt>{m.api_returns()}</dt>
              <dd><code>{typeText(method.returns)}</code></dd>
            </dl>
          </li>
        {/each}
      </ul>

      {#if schema.$defs}
        <h3>{m.api_types()}</h3>
        {#each Object.entries(schema.$defs) as [name, def] (name)}
          <details>
            <summary><code>{name}</code></summary>
            {#if def.description}<p>{def.description}</p>{/if}
            <code class="block">{typeText(def)}</code>
          </details>
        {/each}
      {/if}
    </section>
  {/each}
</div>

<style>
  .api {
    display: grid;
    gap: 20px;
  }
  section {
    display: grid;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font: 600 20px/1.2 var(--display);
    overflow-wrap: anywhere;
  }
  h3 {
    margin-top: 8px;
    font-size: 14px;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .methods {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .methods li {
    display: grid;
    gap: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .sig {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-weight: 600;
  }
  .badge {
    padding: 1px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 12px;
  }
  /* The text says read or write, color only adds to it. */
  .badge.write {
    border-color: var(--warn);
    color: var(--warn);
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 2px 12px;
    margin: 0;
    font-size: 13px;
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  code {
    overflow-wrap: anywhere;
  }
  .block {
    display: block;
    padding: 8px;
    border-radius: 8px;
    background: var(--bg);
  }
  summary {
    cursor: pointer;
  }
  @media (width < 600px) {
    dl {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

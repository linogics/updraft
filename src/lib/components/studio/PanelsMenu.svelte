<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { studioLayout } from '#lib/state/studioLayout.svelte';
  import { BUILTIN_PANELS } from '#lib/studio/panels';
  import Popover from '../Popover.svelte';
</script>

<Popover label={m.panels_menu()}>
  <ul>
    {#each BUILTIN_PANELS as p (p.id)}
      <li>
        <label>
          <!-- The switch attribute is Safari only for now, other browsers draw a checkbox. -->
          <input
            type="checkbox"
            {...{ switch: true }}
            checked={!studioLayout.value.hidden.includes(p.id)}
            onchange={(e) => (e.currentTarget.checked ? studioLayout.show(p.id) : studioLayout.hide(p.id))}
          />
          {p.title()}
        </label>
      </li>
    {/each}
  </ul>
  <button type="button" onclick={() => studioLayout.restoreDefaults()}>{m.panels_restore()}</button>
</Popover>

<style>
  ul {
    display: grid;
    gap: 8px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type='checkbox'] {
    accent-color: var(--primary);
    margin: 0;
    cursor: pointer;
  }
  input[type='checkbox']:focus-visible {
    outline: 3px solid var(--primary-hi);
    outline-offset: 3px;
  }
</style>

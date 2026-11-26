<script lang="ts">
  import Languages from '@lucide/svelte/icons/languages';
  import Maximize from '@lucide/svelte/icons/maximize';
  import Minimize from '@lucide/svelte/icons/minimize';

  import { CAMERA_MODES, LAYOUTS } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import { getLocale, type Locale, setLocale } from '#lib/paraglide/runtime';
  import type { StudioState } from '#lib/state/studio.svelte';

  import Logo from './Logo.svelte';
  import Popover from './Popover.svelte';
  import PanelsMenu from './studio/PanelsMenu.svelte';

  let { studio }: { studio: StudioState } = $props();

  const LAYOUT_LABELS = { '3d': () => '3D', '2d': () => '2D', split: () => m.layout_split() } as const;
  const CAMERA_LABELS = {
    follow: () => m.camera_follow(),
    cockpit: () => m.camera_cockpit(),
    orbit: () => m.camera_orbit(),
    free: () => m.camera_free(),
    keys: () => m.camera_keys()
  } as const;
  // Each language is named in itself.
  const LOCALES: { id: Locale; name: string }[] = [
    { id: 'en', name: 'English' },
    { id: 'de', name: 'Deutsch' },
    { id: 'fr', name: 'Français' }
  ];

  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  let fullscreen = $state(false);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<div class="toolbar">
  <Logo compact />

  <div class="center">
    <div class="group" role="group" aria-label={m.toolbar_layout()}>
      {#each LAYOUTS as l (l)}
        <button class:active={studio.layout === l} onclick={() => (studio.layout = l)}>{LAYOUT_LABELS[l]()}</button>
      {/each}
    </div>

    <div class="group" role="group" aria-label={m.toolbar_camera()}>
      {#each CAMERA_MODES as c (c)}
        <button class:active={studio.camera === c} onclick={() => (studio.camera = c)}>{CAMERA_LABELS[c]()}</button>
      {/each}
    </div>
  </div>

  <div class="end">
    <PanelsMenu />

    <Popover label={m.lang_label()}>
      {#snippet icon()}<Languages size={16} aria-hidden="true" />{/snippet}
      <ul class="locales">
        {#each LOCALES as l (l.id)}
          <li>
            <!-- setLocale saves the choice and reloads. -->
            <button type="button" aria-current={getLocale() === l.id} onclick={() => setLocale(l.id)}>{l.name}</button>
          </li>
        {/each}
      </ul>
    </Popover>

    {#if canFullscreen}
      <button
        onclick={toggleFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? m.toolbar_exit_fullscreen() : m.toolbar_fullscreen()}
        title={fullscreen ? m.toolbar_exit_fullscreen() : m.toolbar_fullscreen()}
      >
        {#if fullscreen}<Minimize size={16} aria-hidden="true" />{:else}<Maximize size={16} aria-hidden="true" />{/if}
      </button>
    {/if}
  </div>
</div>

<style>
  .toolbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
  }
  .toolbar > :global(.logo) {
    justify-self: start;
  }
  .center {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
  .end {
    display: flex;
    justify-self: end;
    gap: 8px;
  }
  .end > :global(button) {
    display: inline-flex;
    align-items: center;
  }
  /* Narrow screens stack the three parts. */
  @media (max-width: 1099px) {
    .toolbar {
      grid-template-columns: 1fr auto;
    }
    .center {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
  .group {
    display: flex;
  }
  .group button {
    border-radius: 0;
    text-transform: capitalize;
  }
  .group button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .group button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .group button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg);
  }
  .locales {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .locales button {
    width: 100%;
    text-align: left;
  }
  .locales button[aria-current='true'] {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg);
  }
</style>

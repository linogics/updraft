<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  /** Popup menu of commands: one tab stop, arrow keys, Escape. Items are plain `<button type="button">` children. */
  let { label, triggerId, children }: { label: string; triggerId?: string; children: Snippet } = $props();

  const uid = $props.id();
  const tid = $derived(triggerId ?? `menu-${uid}`);
  const id = $derived(`${tid}-popup`);
  let button: HTMLButtonElement;
  let popup: HTMLDivElement;
  let group: HTMLDivElement;
  let open = $state(false);
  // Keyboard opens enter the menu, pointer opens leave focus on the trigger.
  let enterOnOpen = false;

  const invokers = typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;
  const anchored = typeof CSS !== 'undefined' && CSS.supports('position-area: block-end');
  const items = () => [...group.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')];

  function onToggle(e: ToggleEvent) {
    open = e.newState === 'open';
    if (!open) return;

    if (!anchored) {
      const r = button.getBoundingClientRect();
      popup.style.top = `${r.bottom + 4}px`;
      popup.style.left = `${Math.max(8, Math.min(r.left, innerWidth - popup.offsetWidth - 8))}px`;
    }

    if (enterOnOpen) items()[0]?.focus();
    enterOnOpen = false;
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') enterOnOpen = true;
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) items()[0]?.focus();
      else {
        enterOnOpen = true;
        button.click();
      }
    }
  }

  // Roles are set here and not left to focusgroup, because some Chromium builds expose the property
  // without inferring menu roles. Arrow keys come from script only where focusgroup is missing.
  onMount(() => {
    group.setAttribute('role', 'menu');
    for (const b of group.querySelectorAll('button')) b.setAttribute('role', 'menuitem');
    if ('focusGroup' in HTMLElement.prototype) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (!keys.includes(e.key) || at < 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? -1 : 1;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length;
      list[next].focus();
    };

    group.addEventListener('keydown', onKey);
    return () => group.removeEventListener('keydown', onKey);
  });
</script>

<button
  bind:this={button}
  id={tid}
  class="trigger"
  type="button"
  aria-haspopup="menu"
  aria-expanded={open}
  aria-label={label}
  title={label}
  {...invokers ? { commandfor: id, command: 'toggle-popover' } : { popovertarget: id }}
  onkeydown={onTriggerKey}
>
  <span aria-hidden="true">⋯</span>
</button>
<!-- Right after its trigger, so the browser adds no implicit aria-details. -->
<!-- Clicks come from the buttons inside, which are keyboard operable. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={popup}
  {id}
  popover="auto"
  ontoggle={onToggle}
  onclick={(e) => (e.target as HTMLElement).closest('button') && popup.hidePopover()}
  onfocusout={(e) =>
    !popup.contains(e.relatedTarget as Node | null) && e.relatedTarget !== button && popup.hidePopover()}
>
  <!-- Nested, because Chromium drops focusgroup behaviour on the popover element itself. -->
  <div bind:this={group} {...{ focusgroup: 'menu nomemory' }} aria-labelledby={tid}>
    {@render children()}
  </div>
</div>

<style>
  .trigger {
    padding: 0 6px;
    line-height: 1.4;
    border-color: transparent;
    background: none;
    color: var(--muted);
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    color: var(--text);
    background: var(--surface-2);
  }
  [popover] {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 4px;
    min-width: 180px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 13px;
  }
  @supports (position-area: block-end) {
    [popover] {
      position-area: block-end span-inline-end;
      position-try-fallbacks:
        flip-block,
        flip-inline,
        flip-block flip-inline;
    }
  }
  [focusgroup] {
    display: grid;
  }
  [focusgroup] :global(button) {
    border-color: transparent;
    background: none;
    text-align: start;
  }
  [focusgroup] :global(button:hover:not(:disabled)),
  [focusgroup] :global(button:focus-visible) {
    background: var(--surface-2);
  }
  [focusgroup] :global(hr) {
    width: 100%;
    margin: 4px 0;
    border: 0;
    border-top: 1px solid var(--border);
  }
</style>

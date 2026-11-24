<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { m } from '#lib/paraglide/messages';

  let {
    label,
    header,
    children,
    inertTarget = () => document.querySelector<HTMLElement>('main')
  }: {
    /** Accessible name of the sidebar and of the drawer. */
    label: string;
    /** Sticky top part, shown in the mobile top bar and above the body. */
    header: Snippet;
    /** Scrollable body. */
    children: Snippet;
    /** The page content that becomes inert while the drawer is open. */
    inertTarget?: () => HTMLElement | null;
  } = $props();

  const id = $props.id();
  const MOBILE = '(max-width: 800px)';

  let drawer: HTMLElement;
  let scroller: HTMLElement;
  let sheet: HTMLElement;
  let bar: HTMLElement;
  let openBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;
  // True below 800px: the sidebar acts as a modal drawer, so it gets the dialog role.
  let mobile = $state(false);
  let open = $state(false);
  // True while the drawer is placed at its closed stop, so the observer ignores intermediate positions.
  let settling = false;

  function setInert(value: boolean) {
    const target = inertTarget();
    if (target) target.inert = value;
    bar.inert = value;
  }

  async function openDrawer() {
    open = true;
    settling = true;
    drawer.showPopover();
    setInert(true);
    closeBtn.focus({ preventScroll: true });
    if (!CSS.supports('scroll-initial-target', 'nearest')) {
      // Without scroll-initial-target the sheet starts open. Jump to the closed stop, so the scroll below slides it in.
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'instant' });
      // Two frames, so the jump commits before the next scroll cancels it.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    settling = false;
    scroller.scrollTo({ left: 0, behavior: 'auto' });
  }

  function closeDrawer() {
    if (open) scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'auto' });
  }

  /** Runs once the sheet is fully off screen, or at once when the layout switches back to a sidebar. */
  function finishClose() {
    if (!open) return;
    open = false;
    if (drawer.matches(':popover-open')) drawer.hidePopover();
    setInert(false);
    openBtn.focus();
  }

  onMount(() => {
    const query = matchMedia(MOBILE);
    mobile = query.matches;
    const onQuery = (e: MediaQueryListEvent) => {
      mobile = e.matches;
      if (!e.matches) finishClose();
    };
    query.addEventListener('change', onQuery);

    // The observer is the single source of truth: swipe, button, backdrop tap and Escape all end here.
    const visible = 1 / window.innerWidth;
    const observer = new IntersectionObserver(
      (entries) => {
        if (settling) return;
        if (entries.at(-1)!.intersectionRatio < visible) finishClose();
      },
      { root: drawer, threshold: [visible, 1] }
    );
    observer.observe(sheet);

    // Fallback for browsers without scroll-driven animations: write the backdrop opacity from scroll events.
    const onScroll = () =>
      drawer.style.setProperty('--drawer-backdrop', String(1 - scroller.scrollLeft / sheet.offsetWidth));
    const fade = !CSS.supports('animation-timeline: scroll()');
    if (fade) scroller.addEventListener('scroll', onScroll);

    return () => {
      query.removeEventListener('change', onQuery);
      observer.disconnect();
      if (fade) scroller.removeEventListener('scroll', onScroll);
    };
  });
</script>

<!-- Popovers do not fire cancel, so Escape is handled on the document. -->
<svelte:document onkeydown={(e) => e.key === 'Escape' && closeDrawer()} />

<div class="bar" bind:this={bar}>
  <button
    bind:this={openBtn}
    class="menu"
    aria-label={m.drawer_menu()}
    aria-expanded={open}
    aria-controls="{id}-drawer"
    onclick={openDrawer}
  >
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </button>
  {@render header()}
</div>

<!-- popover="manual" is required: auto would light-dismiss mid-swipe. Light dismiss is handled on click instead. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={drawer}
  class="drawer"
  id="{id}-drawer"
  popover="manual"
  role={mobile ? 'dialog' : undefined}
  aria-label={label}
  aria-modal={open ? 'true' : undefined}
  onclick={(e) => mobile && !sheet.contains(e.target as Node) && closeDrawer()}
>
  <div class="scroller" bind:this={scroller}>
    <div class="sheet" bind:this={sheet}>
      <div class="head">
        {@render header()}
        <!-- svelte-ignore a11y_autofocus -->
        <button bind:this={closeBtn} class="close" aria-label={m.drawer_close()} autofocus onclick={closeDrawer}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <!-- Following a link navigates away, so close the drawer on the way. Keyboard users trigger the same click. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="body" onclick={(e) => (e.target as Element).closest('a[href]') && closeDrawer()}>
        {@render children()}
      </div>
    </div>
  </div>
</div>

<style>
  .bar,
  .close {
    display: none;
  }

  /* Sidebar: sticky, as tall as the viewport, only the body scrolls. */
  .drawer {
    --drawer-width: min(20em, 80dvw, 100dvw - 24px);
    --drawer-backdrop: 0;
    position: sticky;
    inset: 0 auto auto 0;
    align-self: start;
    width: auto;
    height: 100dvh;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: visible;
    background: var(--surface);
    color: inherit;
  }
  .scroller,
  .sheet {
    height: 100%;
  }
  .sheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-inline-end: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }
  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .scroller::after {
    display: none;
  }

  /* A closed popover is display: none, so force the sidebar visible on wide screens. */
  @media (min-width: 801px) {
    .drawer {
      display: block;
    }
  }

  @media (max-width: 800px) {
    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    .menu,
    .close {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
    }
    /* The popover is display: none until opened, so the drawer is out of the page layout. */
    .drawer {
      position: fixed;
      inset: 0;
      height: auto;
      max-width: none;
      max-height: none;
      background: transparent;
    }
    .drawer::backdrop {
      background: #000;
      /* Limit the range so the page stays visible behind the scrim. */
      opacity: calc(var(--drawer-backdrop) / 2);
    }
    .scroller {
      position: relative;
      display: grid;
      grid-template-columns: var(--drawer-width) 100%;
      height: 100%;
      overflow-x: scroll;
      overscroll-behavior: none;
      scrollbar-width: none;
      /* Mandatory: the drawer always settles fully open or fully closed. */
      scroll-snap-type: x mandatory;
    }
    .scroller::after {
      display: block;
      content: '';
      /* The empty spacer is the closed stop. The drawer opens already scrolled to it. */
      scroll-snap-align: end;
      scroll-initial-target: nearest;
    }
    .sheet {
      /* svh, so the height does not jump when the browser toolbar resizes mid-swipe. */
      height: 100svh;
      background: var(--surface);
      scroll-snap-align: start;
    }
    @media (prefers-reduced-motion: no-preference) {
      .scroller {
        scroll-behavior: smooth;
      }
    }
  }

  /* Without the @supports gate, browsers that lack animation-timeline would keep the first keyframe forever. */
  @supports (animation-timeline: scroll()) {
    @media (max-width: 800px) {
      .drawer {
        timeline-scope: --drawer-fade;
        animation: fade-backdrop linear both;
        animation-timeline: --drawer-fade;
      }
      .scroller {
        scroll-timeline: --drawer-fade x;
      }
    }
    @property --drawer-backdrop {
      syntax: '<number>';
      inherits: true;
      initial-value: 0;
    }
    @keyframes fade-backdrop {
      0% {
        --drawer-backdrop: 1;
      }
      100% {
        --drawer-backdrop: 0;
      }
    }
  }

  .menu:focus-visible,
  .close:focus-visible {
    outline-offset: -2px;
  }
</style>

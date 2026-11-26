import { mount, unmount } from 'svelte';

import { m } from '#lib/paraglide/messages';
import type { AnalysisService } from '#lib/studio/analysisService.svelte';
import type { StudioPlugin } from '#lib/studio/plugins';
import type { StudioService } from '#lib/studio/studioService.svelte';

import StatsPanel from './StatsPanel.svelte';

/** Reference example: the built-in Stats panel reads the studio only through services. */
const plugin: StudioPlugin = {
  id: 'updraft/stats',
  name: m.panel_stats(),
  kind: 'studio',
  apiVersion: 2,
  dock: 'right',
  requires: ['updraft/studio@1', 'updraft/flight-analysis@1'],
  mount(el, ctx) {
    const app = mount(StatsPanel, {
      target: el,
      props: {
        studio: ctx.use<StudioService>('updraft/studio@1'),
        analysis: ctx.use<AnalysisService>('updraft/flight-analysis@1'),
        need: ctx.need
      }
    });

    return () => void unmount(app);
  }
};

export default plugin;

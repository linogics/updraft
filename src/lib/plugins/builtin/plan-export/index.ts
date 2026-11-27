import { m } from '#lib/paraglide/messages';
import { PLAN_STATE_SERVICE } from '#lib/plan/planService.svelte';

import { componentPlugin } from '../componentPlugin';
import PlanExportPanel from './PlanExportPanel.svelte';

export default componentPlugin(
  {
    id: 'updraft/plan-export',
    name: m.export_menu(),
    dock: 'right',
    hosts: ['plan'],
    state: { service: PLAN_STATE_SERVICE, prop: 'plan' }
  },
  PlanExportPanel
);

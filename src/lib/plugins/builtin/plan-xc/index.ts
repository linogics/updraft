import { m } from '#lib/paraglide/messages';
import { PLAN_STATE_SERVICE } from '#lib/plan/planService.svelte';

import { componentPlugin } from '../componentPlugin';
import PlanXcPanel from './PlanXcPanel.svelte';

export default componentPlugin(
  {
    id: 'updraft/plan-xc',
    name: m.plan_xc_score(),
    dock: 'right',
    hosts: ['plan'],
    state: { service: PLAN_STATE_SERVICE, prop: 'plan' }
  },
  PlanXcPanel
);

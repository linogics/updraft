import { writeRouteGpx, writeXctsk } from '#lib/domain/task';
import { m } from '#lib/paraglide/messages';

import type { XcPlannerPlugin } from '../xcPlannerKind';

export default {
  id: 'updraft/tasks',
  name: 'Task files',
  kind: 'xc-planner',
  apiVersion: 1,
  exports: [
    {
      label: 'XCTrack task',
      extension: 'xctsk',
      mime: 'application/json',
      write: (r) => writeXctsk([...r.points])
    },
    {
      label: 'GPX route',
      extension: 'gpx',
      mime: 'application/gpx+xml',
      write: (r) => writeRouteGpx([...r.points], m.home_planner_title())
    }
  ]
} satisfies XcPlannerPlugin;

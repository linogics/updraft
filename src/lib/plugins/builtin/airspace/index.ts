import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import AirspaceControls from './AirspaceControls.svelte';

export default componentPlugin(
  { id: 'updraft/airspace', name: m.panel_airspace(), dock: 'right', hosts: ['studio', 'plan'], state: null },
  AirspaceControls
);

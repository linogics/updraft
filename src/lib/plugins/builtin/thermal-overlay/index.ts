import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import ThermalOverlayControls from './ThermalOverlayControls.svelte';

export default componentPlugin(
  {
    id: 'updraft/thermal-overlay',
    name: m.panel_thermal_overlay(),
    dock: 'right',
    hosts: ['studio', 'plan'],
    state: null
  },
  ThermalOverlayControls
);

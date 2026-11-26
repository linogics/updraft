import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import AltitudeChart from './AltitudeChart.svelte';

export default componentPlugin(
  { id: 'updraft/altitude', name: m.studio_tab_altitude(), dock: 'bottom' },
  AltitudeChart
);

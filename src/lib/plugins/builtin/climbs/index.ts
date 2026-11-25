import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import ThermalList from './ThermalList.svelte';

export default componentPlugin({ id: 'updraft/climbs', name: m.climbs_heading(), dock: 'left' }, ThermalList);

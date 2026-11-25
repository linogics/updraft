import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import UnitsPanel from './UnitsPanel.svelte';

export default componentPlugin({ id: 'updraft/units', name: m.units_menu(), dock: 'right' }, UnitsPanel);

import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import IonPanel from './IonPanel.svelte';

export default componentPlugin({ id: 'updraft/ion', name: m.panel_ion(), dock: 'right' }, IonPanel);

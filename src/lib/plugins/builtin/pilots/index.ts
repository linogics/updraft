import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import PilotList from './PilotList.svelte';

export default componentPlugin({ id: 'updraft/pilots', name: m.pilots_heading(), dock: 'left' }, PilotList);

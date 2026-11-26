import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import Timeline from './Timeline.svelte';

export default componentPlugin({ id: 'updraft/timeline', name: m.timeline_label(), dock: 'bottom' }, Timeline);

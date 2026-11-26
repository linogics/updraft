import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import XcPanel from './XcPanel.svelte';

export default componentPlugin({ id: 'updraft/xc', name: m.panel_xc(), dock: 'right' }, XcPanel);

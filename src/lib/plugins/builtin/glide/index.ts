import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import GlidePanel from './GlidePanel.svelte';

export default componentPlugin(
  { id: 'updraft/glide', name: m.glide_title(), dock: 'right', hosts: ['plan'], state: null },
  GlidePanel
);

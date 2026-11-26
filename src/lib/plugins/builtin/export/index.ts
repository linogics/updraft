import { m } from '#lib/paraglide/messages';

import { componentPlugin } from '../componentPlugin';
import ExportPanel from './ExportPanel.svelte';

export default componentPlugin({ id: 'updraft/export', name: m.export_menu(), dock: 'right' }, ExportPanel);

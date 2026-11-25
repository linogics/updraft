import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import ScenePanel from './ScenePanel.svelte';

export default componentPlugin({ id: 'updraft/scene', name: m.panel_scene(), dock: 'right' }, ScenePanel);

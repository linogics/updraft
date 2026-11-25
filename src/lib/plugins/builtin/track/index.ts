import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import TrackPanel from './TrackPanel.svelte';

export default componentPlugin({ id: 'updraft/track', name: m.track_menu(), dock: 'right' }, TrackPanel);

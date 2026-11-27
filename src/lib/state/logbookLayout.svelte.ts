import { PageLayout } from './pageLayout.svelte';

export const logbookLayout = new PageLayout(
  'logbookLayout',
  { main: ['charts', 'achievements', 'flights', 'breakdown'], side: ['upload', 'sync', 'backup'] },
  ['sync', 'backup', 'breakdown']
);

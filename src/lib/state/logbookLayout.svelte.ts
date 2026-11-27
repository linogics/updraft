import { PageLayout } from './pageLayout.svelte';

export const logbookLayout = new PageLayout(
  'logbookLayout',
  { main: ['upload', 'flights', 'breakdown'], side: ['sync', 'backup', 'airtime', 'achievements'] },
  ['sync', 'backup']
);

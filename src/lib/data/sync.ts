import type { SyncEvent, SyncService } from '#lib/plugins/api';
import { syncSchema } from '#lib/plugins/coreSchemas';
import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import { syncClient } from '#lib/sync/client.svelte';

export type { SyncService };

export const SYNC_SERVICE = 'updraft/sync@1';

/** Provides `updraft/sync@1` on top of the sync client. Returns the unregister function. */
export function provideSyncService() {
  return services.provide(
    SYNC_SERVICE,
    (): SyncService =>
      Object.freeze<SyncService>({
        on: eventsOf<SyncEvent>(SYNC_SERVICE, {
          status: () =>
            void [syncClient.session, syncClient.config, syncClient.engine?.lastSyncAt, syncClient.engine?.status]
        }),
        status: () => ({
          signedIn: !!syncClient.session,
          url: syncClient.config?.url ?? null,
          lastSyncAt: syncClient.engine?.lastSyncAt ?? null,
          busy: syncClient.engine?.status === 'syncing'
        }),
        syncNow: () => syncClient.syncNow()
      }),
    'updraft',
    syncSchema
  );
}

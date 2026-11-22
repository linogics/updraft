import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { restoreBackup } from './backup';

const ok = { app: 'updraft', version: 1, flights: [], manual: [], cameraPaths: [] };

describe('restoreBackup validation', () => {
  it('rejects foreign files', async () => {
    await expect(restoreBackup(null, 'merge')).rejects.toThrow('not an updraft backup');
    await expect(restoreBackup({ ...ok, app: 'x' }, 'merge')).rejects.toThrow('not an updraft backup');
  });

  it('rejects other versions and missing arrays', async () => {
    await expect(restoreBackup({ ...ok, version: 2 }, 'merge')).rejects.toThrow('version');
    await expect(restoreBackup({ ...ok, flights: undefined }, 'merge')).rejects.toThrow('incomplete');
  });

  it('rejects flights without id or fixes', async () => {
    await expect(restoreBackup({ ...ok, flights: [{ id: 'a', fixes: [] }] }, 'merge')).rejects.toThrow(
      'without id or track'
    );
    await expect(restoreBackup({ ...ok, flights: [{ fixes: [{}] }] }, 'merge')).rejects.toThrow('without id or track');
  });

  it('rejects broken manual entries and camera keys', async () => {
    await expect(restoreBackup({ ...ok, manual: [{ id: 'm' }] }, 'merge')).rejects.toThrow('manual entry');
    await expect(restoreBackup({ ...ok, cameraPaths: [{ tracks: {} }] }, 'merge')).rejects.toThrow('camera keys');
  });

  it('accepts an empty backup without localStorage', async () => {
    expect(await restoreBackup(ok, 'merge')).toEqual({ flights: 0, manual: 0, cameraPaths: 0 });
  });
});

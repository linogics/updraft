// Sync writes. Clients cannot write `records` directly, so the last write wins check and the `seq` counter
// live here and run in one transaction.
routerAdd(
  'POST',
  '/api/updraft/push',
  (e) => {
    // Handlers run in an isolated scope, so everything they need is defined inside.
    const TYPES = ['flight', 'manual', 'cameraPath', 'pref'];
    const body = e.requestInfo().body;
    const changes = body && body.changes;
    if (!Array.isArray(changes) || changes.length > 200)
      throw new BadRequestError('changes must be an array of at most 200.');
    for (const c of changes) {
      const ok =
        c &&
        typeof c === 'object' &&
        TYPES.indexOf(c.type) >= 0 &&
        typeof c.id === 'string' &&
        c.id.length > 0 &&
        c.id.length <= 200 &&
        typeof c.updatedAt === 'number' &&
        isFinite(c.updatedAt);
      if (!ok) throw new BadRequestError('Invalid change.');
    }

    const owner = e.auth.id;
    $app.runInTransaction((txApp) => {
      const collection = txApp.findCollectionByNameOrId('records');
      const top = new DynamicModel({ seq: 0 });
      txApp.db().newQuery('SELECT COALESCE(MAX(seq), 0) AS seq FROM records').one(top);
      let seq = top.seq;

      for (const c of changes) {
        let row = null;
        try {
          row = txApp.findFirstRecordByFilter('records', 'owner = {:o} && type = {:t} && rid = {:r}', {
            o: owner,
            t: c.type,
            r: c.id
          });
        } catch (_) {
          // Not found, so the record is new.
        }
        if (row && !(c.updatedAt > row.getFloat('updatedAt'))) continue;
        if (!row) {
          row = new Record(collection);
          row.set('owner', owner);
          row.set('type', c.type);
          row.set('rid', c.id);
        }

        const deleted = c.deleted === true;
        const data = deleted ? null : c.data === undefined ? null : c.data;
        // Only a live flight can be shared. The summary lets the club list skip the heavy `data` column.
        const share =
          c.type === 'flight' && !deleted && data !== null && typeof data === 'object' && data.shared === true;
        row.set('updatedAt', c.updatedAt);
        row.set('deleted', deleted);
        row.set('data', data);
        row.set('shared', share);
        row.set('summary', share && data.club !== undefined ? data.club : null);
        row.set('seq', ++seq);
        txApp.save(row);
      }
    });

    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

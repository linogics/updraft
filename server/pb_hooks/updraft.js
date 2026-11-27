// Shared by the route files. Handlers run in isolated scopes, so they load this with require().
const TYPES = ['flight', 'manual', 'cameraPath', 'pref'];
const MAX_CHANGES = 200;
const MAX_PULL = 1000;

function validateChanges(changes) {
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES)
    throw new BadRequestError(`changes must be an array of at most ${MAX_CHANGES}.`);
  for (const c of changes) {
    const ok =
      c &&
      typeof c === 'object' &&
      TYPES.indexOf(c.type) >= 0 &&
      typeof c.id === 'string' &&
      c.id.length > 0 &&
      c.id.length <= 200 &&
      typeof c.updatedAt === 'number' &&
      isFinite(c.updatedAt) &&
      (c.deleted === undefined || typeof c.deleted === 'boolean');
    if (!ok) throw new BadRequestError('Invalid change.');
  }
}

// Last write wins per record. The seq counter and the check share one transaction.
function applyChanges(owner, changes) {
  validateChanges(changes);
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
}

// JSON columns come back as raw text.
function jsonOf(text) {
  const s = String(text || '');
  return s === '' ? null : JSON.parse(s);
}

function session(user) {
  return {
    token: user.newAuthToken(),
    user: { id: user.id, name: user.email() || user.getString('name') || user.getString('username') || user.id }
  };
}

module.exports = { applyChanges, jsonOf, session, MAX_CHANGES, MAX_PULL };

// Shared by the route files. Handlers run in isolated scopes, so they load this with require().
const LIMITS = { maxPage: 200, maxItemBytes: 1000000, maxTrackBytes: 20000000 };
const COLLECTIONS = ['flights', 'camera-paths', 'prefs'];
const KINDS = ['track', 'track.json'];

function fail(e, status, message) {
  return e.json(status, { message });
}

// Every write takes the next number of the one server counter. Call it inside a transaction.
function nextSeq(txApp) {
  const row = new DynamicModel({ n: 0 });
  txApp.db().newQuery('UPDATE sync_counter SET n = n + 1 RETURNING n').one(row);
  return row.n;
}

function currentSeq() {
  const row = new DynamicModel({ n: 0 });
  $app.db().newQuery('SELECT n FROM sync_counter').one(row);
  return row.n;
}

// The auth routes are open to the internet. A fixed window per client IP, 2 requests per 3 seconds like PocketBase's
// own auth rule, but with the Retry-After header the spec asks for. The IP honors the trusted proxy setting.
// shortcut: in memory, so a restart resets it and a second server process counts alone, use a proxy rule then.
const WINDOW_MS = 3000;
const WINDOW_MAX = 2;

function rateLimited(e) {
  const now = Date.now();
  const key = `updraft_rl_${e.realIP()}`;
  const cur = $app.store().get(key);

  // Drop expired windows once a minute, so the store does not grow with every address ever seen.
  if (now - Number($app.store().get('updraft_rl_prune') || 0) > 60000) {
    $app.store().set('updraft_rl_prune', now);
    const all = $app.store().getAll();
    for (const k of Object.keys(all)) {
      if (k.startsWith('updraft_rl_') && k !== 'updraft_rl_prune' && now - all[k].start >= WINDOW_MS)
        $app.store().remove(k);
    }
  }

  if (!cur || now - cur.start >= WINDOW_MS) {
    $app.store().set(key, { start: now, count: 1 });
    return 0;
  }

  if (cur.count >= WINDOW_MAX) return Math.ceil((cur.start + WINDOW_MS - now) / 1000);

  $app.store().set(key, { start: cur.start, count: cur.count + 1 });
  return 0;
}

function find(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params);
  } catch (_) {
    return null;
  }
}

function clubsEnabled() {
  try {
    $app.findCollectionByNameOrId('clubs');
    return true;
  } catch (_) {
    return false;
  }
}

// Reads since and limit of a feed. Returns { since, after, limit } or a message for a 400.
function paging(q) {
  const limitText = q.get('limit') || String(LIMITS.maxPage);
  if (!/^\d{1,6}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > LIMITS.maxPage)
    return { error: `limit must be 1 to ${LIMITS.maxPage}.` };

  const since = q.get('since') || null;
  // A cursor is a counter value. One from the future is a cursor this server never gave out.
  if (since !== null && (!/^\d{1,15}$/.test(since) || Number(since) > currentSeq())) return { error: 'Bad cursor.' };

  return { since, after: since === null ? 0 : Number(since), limit: Number(limitText) };
}

function feed(e, rows, since, limit, map) {
  const last = rows[rows.length - 1];
  return e.json(200, {
    items: rows.map(map),
    cursor: last ? String(last.getInt('seq')) : since,
    more: rows.length === limit
  });
}

function itemOf(r) {
  const item = { id: r.getString('iid'), version: String(r.getInt('seq')), deleted: r.getBool('deleted') };
  if (item.deleted) return item;

  item.data = jsonOf(r.getString('data'));
  item.times = jsonOf(r.getString('times'));
  if (r.getBool('secret')) item.secret = true;
  return item;
}

function sendItem(e, status, r) {
  e.response.header().set('ETag', `"${r.getInt('seq')}"`);
  return e.json(status, itemOf(r));
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// Returns { body } for a valid ItemWrite, else { status, message } for the 400 or 413.
function parseWrite(e) {
  let text = '';
  try {
    text = toString(e.request.body);
  } catch (_) {
    return { status: 413, message: 'Too large.' };
  }

  if (text.length > LIMITS.maxItemBytes) return { status: 413, message: 'Too large.' };

  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {
    return { status: 400, message: 'Invalid JSON.' };
  }

  const timesOk = body && isObject(body.times) && Object.values(body.times).every((n) => typeof n === 'number');
  if (!body || !isObject(body.data) || !timesOk) return { status: 400, message: 'Expected data and times.' };
  if (body.secret !== undefined && typeof body.secret !== 'boolean')
    return { status: 400, message: 'secret must be a boolean.' };

  return { body };
}

// Keeps the club entries of one flight in step with its data. `data` is null for a tombstone.
// An entry exists once a flight was shared with a club the owner belongs to, and is only ever marked deleted.
function syncClubs(txApp, owner, iid, data) {
  if (!clubsEnabled()) return;

  const shared = data && Array.isArray(data.clubs) ? data.clubs.filter((c) => typeof c === 'string') : [];
  const entries = txApp.findRecordsByFilter('club_entries', 'owner = {:o} && flight = {:f}', '', 0, 0, {
    o: owner,
    f: iid
  });
  const collection = txApp.findCollectionByNameOrId('club_entries');

  const live = [];
  for (const club of shared) {
    if (find(txApp, 'club_members', 'club = {:c} && user = {:u}', { c: club, u: owner })) live.push(club);
  }

  for (const entry of entries) {
    if (live.indexOf(entry.getString('club')) < 0 && !entry.getBool('deleted')) {
      entry.set('deleted', true);
      entry.set('summary', null);
      entry.set('seq', nextSeq(txApp));
      txApp.save(entry);
    }
  }

  for (const club of live) {
    let entry = entries.find((x) => x.getString('club') === club);
    if (!entry) {
      entry = new Record(collection);
      entry.set('club', club);
      entry.set('owner', owner);
      entry.set('flight', iid);
    }

    entry.set('deleted', false);
    entry.set('summary', data.club === undefined ? null : data.club);
    entry.set('hasTrack', data.hasTrack === true);
    entry.set('seq', nextSeq(txApp));
    txApp.save(entry);
  }
}

// Atomic version check plus counter. Returns { status, record } where record is the current or stored item.
function writeItem(owner, coll, iid, ifMatch, ifNone, body) {
  let out = null;
  $app.runInTransaction((txApp) => {
    const cur = find(txApp, 'items', 'owner = {:o} && coll = {:c} && iid = {:i}', { o: owner, c: coll, i: iid });
    if (ifNone === '*' && cur) {
      out = { status: 412, record: cur };
      return;
    }

    if (ifMatch && !cur) {
      out = { status: 404 };
      return;
    }

    if (ifMatch && cur && ifMatch !== `"${cur.getInt('seq')}"`) {
      out = { status: 412, record: cur };
      return;
    }

    const record = cur || new Record(txApp.findCollectionByNameOrId('items'));
    if (!cur) {
      record.set('owner', owner);
      record.set('coll', coll);
      record.set('iid', iid);
    }

    if (body === null) {
      record.set('deleted', true);
      record.set('data', null);
      record.set('times', null);
      record.set('secret', false);
    } else {
      record.set('deleted', false);
      record.set('data', body.data);
      record.set('times', body.times);
      record.set('secret', coll === 'prefs' && body.secret === true);
    }

    record.set('seq', nextSeq(txApp));
    txApp.save(record);

    if (coll === 'flights') {
      if (body === null) {
        for (const t of txApp.findRecordsByFilter('tracks', 'owner = {:o} && flight = {:f}', '', 0, 0, {
          o: owner,
          f: iid
        })) {
          txApp.delete(t);
        }
      }
      syncClubs(txApp, owner, iid, body === null ? null : body.data);
    }

    out = { status: body === null ? 204 : 200, record };
  });
  return out;
}

// Writes a track once. 404 when the flight is missing or deleted, 412 when the file is there.
function writeTrack(owner, iid, kind, mime, bytes) {
  let status = 201;
  $app.runInTransaction((txApp) => {
    const flight = find(txApp, 'items', 'owner = {:o} && coll = "flights" && iid = {:i}', { o: owner, i: iid });
    if (!flight || flight.getBool('deleted')) {
      status = 404;
      return;
    }

    if (find(txApp, 'tracks', 'owner = {:o} && flight = {:f} && kind = {:k}', { o: owner, f: iid, k: kind })) {
      status = 412;
      return;
    }

    const record = new Record(txApp.findCollectionByNameOrId('tracks'));
    record.set('owner', owner);
    record.set('flight', iid);
    record.set('kind', kind);
    record.set('mime', mime);
    record.set('file', $filesystem.fileFromBytes(bytes, kind));
    txApp.save(record);
  });
  return status;
}

function sendTrack(e, record) {
  const fsys = $app.newFilesystem();
  try {
    const reader = fsys.getReader(`${record.baseFilesPath()}/${record.getString('file')}`);
    try {
      const h = e.response.header();
      // The bytes are the pilot's own upload, so they never get a chance to run as a page.
      h.set('X-Content-Type-Options', 'nosniff');
      h.set('Content-Security-Policy', 'sandbox');
      return e.stream(200, record.getString('mime') || 'application/octet-stream', reader);
    } finally {
      reader.close();
    }
  } finally {
    fsys.close();
  }
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

// OAuth is off unless the server knows which app origins may receive the token and its own public address.
// The public address is configured, not read from the request, so a forged Host header cannot steer the redirect.
const OAUTH_COOKIE = 'updraft_oauth';
const OAUTH_PATH = '/api/updraft/v2/auth';

function appOrigins() {
  return ($os.getenv('UPDRAFT_APP_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function publicUrl() {
  const url = ($os.getenv('UPDRAFT_PUBLIC_URL') || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s?#]+$/.test(url) ? url : '';
}

// The providers enabled on the users collection, as { id, label, config }.
function oauthProviders() {
  if (appOrigins().length === 0 || publicUrl() === '') return [];
  const oauth2 = $app.findCollectionByNameOrId('users').oauth2;
  if (!oauth2.enabled) return [];
  const list = [];
  for (const config of oauth2.providers) {
    try {
      list.push({ id: config.name, label: config.displayName || config.initProvider().displayName(), config });
    } catch (_) {
      // A broken provider config is not offered.
    }
  }
  return list;
}

// Sends the popup back to the app. The result travels in the URL fragment, which no server or proxy sees.
// The app page hands it to the opener tab on a BroadcastChannel, because providers' COOP headers cut window.opener.
const APP_CALLBACK = '/oauth-callback.html';

function resultRedirect(e, saved, message) {
  const result = encodeURIComponent(JSON.stringify({ type: 'updraft-auth', state: saved.appState, ...message }));
  const h = e.response.header();
  h.set('Cache-Control', 'no-store');
  h.set('Referrer-Policy', 'no-referrer');
  return e.redirect(302, `${saved.origin}${APP_CALLBACK}#${result}`);
}

module.exports = {
  LIMITS,
  COLLECTIONS,
  KINDS,
  fail,
  find,
  rateLimited,
  clubsEnabled,
  paging,
  feed,
  itemOf,
  sendItem,
  parseWrite,
  syncClubs,
  nextSeq,
  writeItem,
  writeTrack,
  sendTrack,
  jsonOf,
  session,
  appOrigins,
  publicUrl,
  oauthProviders,
  resultRedirect,
  OAUTH_COOKIE,
  OAUTH_PATH
};

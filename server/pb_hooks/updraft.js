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

// OAuth is off unless the server knows which app origins may receive the token and its own public address.
// The public address is configured, not read from the request, so a forged Host header cannot steer the redirect.
const OAUTH_COOKIE = 'updraft_oauth';
const OAUTH_PATH = '/api/updraft/v1/auth';

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

// Safe inside an inline script and a JSON string.
function scriptJson(value) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  );
}

// Hands the result to the window that opened the popup, and only to the origin saved before the redirect.
function resultPage(e, origin, message) {
  const nonce = $security.randomString(24);
  const script = `window.opener&&window.opener.postMessage(${scriptJson({ type: 'updraft-auth', ...message })},${scriptJson(origin)});window.close();`;
  const h = e.response.header();
  h.set('Content-Security-Policy', `default-src 'none'; base-uri 'none'; script-src 'nonce-${nonce}'`);
  h.set('Cache-Control', 'no-store');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-Content-Type-Options', 'nosniff');
  return e.html(
    200,
    `<!doctype html><meta charset="utf-8"><title>Updraft</title><p>You can close this window.</p><script nonce="${nonce}">${script}</script>`
  );
}

module.exports = {
  applyChanges,
  jsonOf,
  session,
  appOrigins,
  publicUrl,
  oauthProviders,
  resultPage,
  OAUTH_COOKIE,
  OAUTH_PATH,
  MAX_CHANGES,
  MAX_PULL
};

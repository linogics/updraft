// Updraft sync HTTP spec v1, documented in docs/plugins/backend/server/openapi.yaml.
// Handlers run in isolated scopes, so each one loads the shared module itself.
const BASE = '/api/updraft/v1';
const auth = $apis.requireAuth('users');

routerAdd('GET', BASE, (e) => {
  const { MAX_CHANGES, MAX_PULL } = require(`${__hooks}/updraft.js`);
  return e.json(200, {
    version: 1,
    auth: { password: true, signup: $os.getenv('UPDRAFT_SIGNUP') === 'true', oauth: [] },
    club: true,
    limits: { maxChanges: MAX_CHANGES, maxPull: MAX_PULL }
  });
});

routerAdd('POST', `${BASE}/auth/password`, (e) => {
  const { session } = require(`${__hooks}/updraft.js`);
  const body = e.requestInfo().body;
  if (!body || typeof body.identity !== 'string' || typeof body.password !== 'string' || !body.identity)
    throw new BadRequestError('identity and password are required.');
  let user = null;
  try {
    user = $app.findAuthRecordByEmail('users', body.identity);
  } catch (_) {
    // Unknown identity gets the same answer as a wrong password.
  }
  if (!user || !user.validatePassword(body.password)) throw new UnauthorizedError('Wrong email or password.');
  return e.json(200, session(user));
});

routerAdd('POST', `${BASE}/auth/signup`, (e) => {
  const { session } = require(`${__hooks}/updraft.js`);
  if ($os.getenv('UPDRAFT_SIGNUP') !== 'true') throw new ForbiddenError('Signup is disabled.');
  const body = e.requestInfo().body;
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string')
    throw new BadRequestError('email and password are required.');
  const user = new Record($app.findCollectionByNameOrId('users'));
  user.set('email', body.email);
  user.set('password', body.password);
  user.set('passwordConfirm', body.password);
  try {
    $app.save(user);
  } catch (err) {
    // Bad email, short password or a taken email. The users collection rules decide which.
    throw new BadRequestError('Invalid email or password.');
  }
  return e.json(200, session(user));
});

routerAdd(
  'POST',
  `${BASE}/push`,
  (e) => {
    const body = e.requestInfo().body;
    require(`${__hooks}/updraft.js`).applyChanges(e.auth.id, body && body.changes);
    return e.json(200, {});
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/pull`,
  (e) => {
    const { MAX_PULL, jsonOf } = require(`${__hooks}/updraft.js`);
    const q = e.request.url.query();
    const cursor = q.get('cursor') || '';
    const limitText = q.get('limit') || '200';
    if (cursor !== '' && !/^\d{1,15}$/.test(cursor)) throw new BadRequestError('cursor must be a number.');
    if (!/^\d{1,6}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > MAX_PULL)
      throw new BadRequestError(`limit must be 1 to ${MAX_PULL}.`);
    const limit = Number(limitText);

    const rows = $app.findRecordsByFilter('records', 'owner = {:o} && seq > {:s}', 'seq', limit, 0, {
      o: e.auth.id,
      s: cursor === '' ? 0 : Number(cursor)
    });
    const changes = rows.map((r) => {
      const c = { type: r.getString('type'), id: r.getString('rid'), updatedAt: r.getFloat('updatedAt') };
      if (r.getBool('deleted')) c.deleted = true;
      else c.data = jsonOf(r.getString('data'));
      return c;
    });
    const last = rows[rows.length - 1];
    return e.json(200, {
      changes,
      cursor: last ? String(last.getInt('seq')) : cursor === '' ? null : cursor,
      more: rows.length === limit
    });
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/club`,
  (e) => {
    const { jsonOf } = require(`${__hooks}/updraft.js`);
    // shortcut: unpaged, fine for club sizes, page it when a club gets thousands of flights.
    const rows = arrayOf(new DynamicModel({ id: '', owner: '', summary: '' }));
    $app
      .db()
      .select('id', 'owner', 'summary')
      .from('records')
      .where($dbx.hashExp({ shared: true, type: 'flight', deleted: false }))
      .orderBy('created ASC', 'id ASC')
      .all(rows);
    return e.json(200, {
      flights: rows.map((r) => ({
        key: r.id,
        owner: r.owner,
        mine: r.owner === e.auth.id,
        stats: jsonOf(r.summary)
      }))
    });
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/club/{key}`,
  (e) => {
    const { jsonOf } = require(`${__hooks}/updraft.js`);
    let row = null;
    try {
      row = $app.findRecordById('records', e.request.pathValue('key'));
    } catch (_) {
      // Same answer as an unshared flight.
    }
    if (!row || !row.getBool('shared') || row.getString('type') !== 'flight' || row.getBool('deleted'))
      throw new NotFoundError('Flight not found.');
    return e.json(200, { data: jsonOf(row.getString('data')) });
  },
  auth
);

// Updraft sync HTTP spec v2, documented in docs/server/openapi.yaml.
// Handlers run in isolated scopes, so each one loads the shared module itself.
const BASE = '/api/updraft/v2';
const { LIMITS } = require(`${__hooks}/updraft.js`);
const auth = $apis.requireAuth('users');

// The app is a page on another origin. PocketBase's CORS layer answers the preflight, this adds the headers
// the client must be able to read.
routerUse((e) => {
  if (e.request.url.path.startsWith('/api/updraft/v2'))
    e.response.header().set('Access-Control-Expose-Headers', 'ETag, Retry-After');
  return e.next();
});

routerAdd('GET', BASE, (e) => {
  const { LIMITS, clubsEnabled, oauthProviders } = require(`${__hooks}/updraft.js`);
  return e.json(200, {
    version: 2,
    auth: {
      password: true,
      signup: $os.getenv('UPDRAFT_SIGNUP') === 'true',
      oauth: oauthProviders().map((p) => ({ id: p.id, label: p.label }))
    },
    clubs: clubsEnabled(),
    limits: LIMITS
  });
});

routerAdd('POST', `${BASE}/auth/password`, (e) => {
  const { rateLimited, session } = require(`${__hooks}/updraft.js`);
  const wait = rateLimited(e);
  if (wait > 0) {
    e.response.header().set('Retry-After', String(wait));
    return e.json(429, { message: 'Too many requests.' });
  }

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
  const { rateLimited, session } = require(`${__hooks}/updraft.js`);
  const wait = rateLimited(e);
  if (wait > 0) {
    e.response.header().set('Retry-After', String(wait));
    return e.json(429, { message: 'Too many requests.' });
  }

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

// OAuth sign in for a popup. Start: redirect to the provider with state and PKCE saved in a cookie.
routerAdd('GET', `${BASE}/auth/redirect/{provider}`, (e) => {
  const { rateLimited, appOrigins, publicUrl, oauthProviders, OAUTH_COOKIE, OAUTH_PATH } = require(
    `${__hooks}/updraft.js`
  );
  const wait = rateLimited(e);
  if (wait > 0) {
    e.response.header().set('Retry-After', String(wait));
    return e.json(429, { message: 'Too many requests.' });
  }

  const origin = e.request.url.query().get('origin') || '';
  if (appOrigins().indexOf(origin) < 0) throw new BadRequestError('origin is not allowed.');
  // The app's own random value, echoed back so the app can tell its result from an injected one.
  const appState = e.request.url.query().get('app_state') || '';
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(appState)) throw new BadRequestError('app_state is not valid.');
  const id = e.request.pathValue('provider');
  const found = oauthProviders().find((p) => p.id === id);
  if (!found) throw new NotFoundError('Unknown provider.');

  const state = $security.randomString(32);
  const verifier = $security.randomString(64);
  // S256 challenge: base64url of the sha256 bytes.
  const challenge = Buffer.from($security.sha256(verifier), 'hex')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const base = publicUrl();
  const provider = found.config.initProvider();
  provider.setRedirectURL(`${base}${OAUTH_PATH}/callback`);
  const url = `${provider.buildAuthURL(state)}&code_challenge=${challenge}&code_challenge_method=S256`;

  e.setCookie(
    new Cookie({
      name: OAUTH_COOKIE,
      value: encodeURIComponent(JSON.stringify({ state, verifier, origin, appState, provider: id })),
      path: OAUTH_PATH,
      maxAge: 600,
      httpOnly: true,
      secure: base.startsWith('https://'),
      sameSite: 2 // Lax, so the cookie comes back on the provider's redirect.
    })
  );
  e.response.header().set('Cache-Control', 'no-store');
  return e.redirect(302, url);
});

// OAuth sign in, step two. Redirects the popup to the app page with the result in the fragment.
routerAdd('GET', `${BASE}/auth/callback`, (e) => {
  const {
    rateLimited,
    appOrigins,
    publicUrl,
    oauthProviders,
    resultRedirect,
    session,
    OAUTH_COOKIE,
    OAUTH_PATH
  } = require(`${__hooks}/updraft.js`);
  const wait = rateLimited(e);
  if (wait > 0) {
    e.response.header().set('Retry-After', String(wait));
    return e.json(429, { message: 'Too many requests.' });
  }

  const q = e.request.url.query();

  let saved = null;
  try {
    saved = JSON.parse(decodeURIComponent(e.request.cookie(OAUTH_COOKIE).value));
  } catch (_) {
    // No cookie or a broken one.
  }
  e.setCookie(new Cookie({ name: OAUTH_COOKIE, value: '', path: OAUTH_PATH, maxAge: -1, httpOnly: true }));

  // Without a trusted cookie there is no origin to answer to, so there is no redirect.
  const state = q.get('state') || '';
  if (
    !saved ||
    typeof saved !== 'object' ||
    typeof saved.origin !== 'string' ||
    appOrigins().indexOf(saved.origin) < 0 ||
    typeof saved.appState !== 'string' ||
    typeof saved.state !== 'string' ||
    state === '' ||
    saved.state !== state
  )
    return e.html(
      400,
      '<!doctype html><meta charset="utf-8"><title>Updraft</title><p>Sign in failed. Start again from the app.</p>'
    );

  const fail = (message) => resultRedirect(e, saved, { error: message });
  if (q.get('error') || !q.get('code')) return fail('Sign in was cancelled.');
  const found = oauthProviders().find((p) => p.id === saved.provider);
  if (!found) return fail('Unknown provider.');

  let authUser = null;
  try {
    const provider = found.config.initProvider();
    provider.setRedirectURL(`${publicUrl()}${OAUTH_PATH}/callback`);
    // Manual code exchange, because the JS binding cannot pass the PKCE verifier option to fetchToken.
    const form = {
      grant_type: 'authorization_code',
      code: q.get('code'),
      redirect_uri: provider.redirectURL(),
      client_id: provider.clientId(),
      client_secret: provider.clientSecret(),
      code_verifier: saved.verifier
    };
    const res = $http.send({
      url: provider.tokenURL(),
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: Object.keys(form)
        .map((k) => `${k}=${encodeURIComponent(form[k])}`)
        .join('&'),
      timeout: 15
    });
    if (res.statusCode !== 200 || !res.json || typeof res.json.access_token !== 'string')
      throw new Error(`token endpoint answered ${res.statusCode}`);
    authUser = provider.fetchAuthUser({
      accessToken: res.json.access_token,
      tokenType: res.json.token_type || 'Bearer',
      refreshToken: res.json.refresh_token || ''
    });
  } catch (err) {
    $app.logger().warn('OAuth sign in failed', 'provider', saved.provider, 'error', String(err));
    return fail('Sign in failed.');
  }
  if (!authUser.id) return fail('Sign in failed.');

  const users = $app.findCollectionByNameOrId('users');
  let user = null;
  try {
    const link = $app.findFirstExternalAuthByExpr(
      $dbx.hashExp({ collectionRef: users.id, provider: saved.provider, providerId: authUser.id })
    );
    user = $app.findRecordById(users, link.recordRef());
  } catch (_) {
    // Not linked yet.
  }
  if (!user) {
    // Same trust as PocketBase's own OAuth sign in: the provider vouches for the email.
    if (authUser.email) {
      try {
        user = $app.findAuthRecordByEmail(users, authUser.email);
      } catch (_) {
        // No account with that email.
      }
    }
    if (!user) {
      if ($os.getenv('UPDRAFT_SIGNUP') !== 'true' || !authUser.email)
        return fail(
          `No account matches your ${found.label} email. Ask the server admin to create one with that email.`
        );
      try {
        user = new Record(users);
        user.set('email', authUser.email);
        const password = $security.randomString(32);
        user.set('password', password);
        user.set('passwordConfirm', password);
        user.set('verified', true);
        $app.save(user);
      } catch (err) {
        $app.logger().warn('OAuth signup failed', 'error', String(err));
        return fail('Sign in failed.');
      }
    }
    try {
      const link = new Record($app.findCollectionByNameOrId('_externalAuths'));
      link.set('collectionRef', users.id);
      link.set('recordRef', user.id);
      link.set('provider', saved.provider);
      link.set('providerId', authUser.id);
      $app.save(link);
    } catch (err) {
      $app.logger().warn('OAuth link failed', 'error', String(err));
      return fail('Sign in failed.');
    }
  }
  return resultRedirect(e, saved, session(user));
});

// Items. The owner is always the signed in account, so one pilot never sees another's items.
routerAdd(
  'GET',
  `${BASE}/{collection}`,
  (e) => {
    const { COLLECTIONS, fail, paging, feed, itemOf } = require(`${__hooks}/updraft.js`);
    const coll = e.request.pathValue('collection');
    if (COLLECTIONS.indexOf(coll) < 0) return fail(e, 404, 'Not found.');

    const p = paging(e.request.url.query());
    if (p.error) return fail(e, 400, p.error);

    const rows = $app.findRecordsByFilter('items', 'owner = {:o} && coll = {:c} && seq > {:s}', 'seq', p.limit, 0, {
      o: e.auth.id,
      c: coll,
      s: p.after
    });
    return feed(e, rows, p.since, p.limit, itemOf);
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/{collection}/{id}`,
  (e) => {
    const { COLLECTIONS, fail, find, sendItem } = require(`${__hooks}/updraft.js`);
    const coll = e.request.pathValue('collection');
    const id = e.request.pathValue('id');
    if (COLLECTIONS.indexOf(coll) < 0 || id.length > 200) return fail(e, 404, 'Not found.');

    const r = find($app, 'items', 'owner = {:o} && coll = {:c} && iid = {:i}', { o: e.auth.id, c: coll, i: id });
    return r ? sendItem(e, 200, r) : fail(e, 404, 'Not found.');
  },
  auth
);

routerAdd(
  'PUT',
  `${BASE}/{collection}/{id}`,
  (e) => {
    const { COLLECTIONS, fail, parseWrite, writeItem, sendItem } = require(`${__hooks}/updraft.js`);
    const coll = e.request.pathValue('collection');
    const id = e.request.pathValue('id');
    if (COLLECTIONS.indexOf(coll) < 0 || id.length > 200) return fail(e, 404, 'Not found.');

    const ifMatch = e.request.header.get('If-Match');
    const ifNone = e.request.header.get('If-None-Match');
    if (!ifMatch && ifNone !== '*') return fail(e, 428, 'Send If-Match or If-None-Match.');

    const parsed = parseWrite(e);
    if (!parsed.body) return fail(e, parsed.status, parsed.message);

    const out = writeItem(e.auth.id, coll, id, ifMatch, ifNone, parsed.body);
    return out.status === 404 ? fail(e, 404, 'Not found.') : sendItem(e, out.status, out.record);
  },
  auth,
  $apis.bodyLimit(LIMITS.maxItemBytes)
);

routerAdd(
  'DELETE',
  `${BASE}/{collection}/{id}`,
  (e) => {
    const { COLLECTIONS, fail, writeItem, sendItem } = require(`${__hooks}/updraft.js`);
    const coll = e.request.pathValue('collection');
    const id = e.request.pathValue('id');
    if (COLLECTIONS.indexOf(coll) < 0 || id.length > 200) return fail(e, 404, 'Not found.');

    const ifMatch = e.request.header.get('If-Match');
    if (!ifMatch) return fail(e, 428, 'Send If-Match.');

    const out = writeItem(e.auth.id, coll, id, ifMatch, '', null);
    if (out.status === 404) return fail(e, 404, 'Not found.');
    return out.status === 412 ? sendItem(e, 412, out.record) : e.noContent(204);
  },
  auth
);

// Tracks are written once. Two files per flight, the original bytes and the parsed fixes.
routerAdd(
  'GET',
  `${BASE}/flights/{id}/{kind}`,
  (e) => {
    const { KINDS, fail, find, sendTrack } = require(`${__hooks}/updraft.js`);
    const kind = e.request.pathValue('kind');
    if (KINDS.indexOf(kind) < 0) return fail(e, 404, 'Not found.');

    const r = find($app, 'tracks', 'owner = {:o} && flight = {:f} && kind = {:k}', {
      o: e.auth.id,
      f: e.request.pathValue('id'),
      k: kind
    });
    return r ? sendTrack(e, r) : fail(e, 404, 'No track.');
  },
  auth
);

routerAdd(
  'PUT',
  `${BASE}/flights/{id}/{kind}`,
  (e) => {
    const { LIMITS, KINDS, fail, writeTrack } = require(`${__hooks}/updraft.js`);
    const kind = e.request.pathValue('kind');
    const id = e.request.pathValue('id');
    if (KINDS.indexOf(kind) < 0 || id.length > 200) return fail(e, 404, 'Not found.');
    if (e.request.header.get('If-None-Match') !== '*') return fail(e, 428, 'Send If-None-Match: *.');

    // toBytes silently cuts at its max, so ask for one byte more than the limit to see an oversized body.
    let bytes = null;
    try {
      bytes = toBytes(e.request.body, LIMITS.maxTrackBytes + 1);
    } catch (_) {
      return fail(e, 413, 'Too large.');
    }

    if (bytes.length > LIMITS.maxTrackBytes) return fail(e, 413, 'Too large.');
    if (bytes.length === 0) return fail(e, 400, 'Empty body.');

    const mime = kind === 'track.json' ? 'application/json' : e.request.header.get('Content-Type').slice(0, 200);
    const status = writeTrack(e.auth.id, id, kind, mime, bytes);
    if (status === 404) return fail(e, 404, 'No such flight.');
    return status === 412 ? fail(e, 412, 'Track already there.') : e.noContent(201);
  },
  auth,
  $apis.bodyLimit(LIMITS.maxTrackBytes)
);

// Clubs are managed by the server admin in the dashboard. The app only reads them.
routerAdd(
  'GET',
  `${BASE}/clubs`,
  (e) => {
    const { clubsEnabled, fail, find } = require(`${__hooks}/updraft.js`);
    if (!clubsEnabled()) return fail(e, 403, 'Clubs are off.');

    const rows = $app.findRecordsByFilter('club_members', 'user = {:u}', '', 0, 0, { u: e.auth.id });
    const clubs = [];
    for (const m of rows) {
      const club = find($app, 'clubs', 'id = {:i}', { i: m.getString('club') });
      if (club) clubs.push({ id: club.id, name: club.getString('name') });
    }
    return e.json(200, { clubs });
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/clubs/{clubId}/flights`,
  (e) => {
    const { clubsEnabled, fail, find, paging, feed, jsonOf } = require(`${__hooks}/updraft.js`);
    if (!clubsEnabled()) return fail(e, 403, 'Clubs are off.');

    const club = e.request.pathValue('clubId');
    if (!find($app, 'club_members', 'club = {:c} && user = {:u}', { c: club, u: e.auth.id }))
      return fail(e, 404, 'Not found.');

    const p = paging(e.request.url.query());
    if (p.error) return fail(e, 400, p.error);

    const rows = $app.findRecordsByFilter('club_entries', 'club = {:c} && seq > {:s}', 'seq', p.limit, 0, {
      c: club,
      s: p.after
    });
    return feed(e, rows, p.since, p.limit, (r) => {
      const deleted = r.getBool('deleted');
      const item = {
        key: r.id,
        owner: r.getString('owner'),
        mine: r.getString('owner') === e.auth.id,
        version: String(r.getInt('seq')),
        deleted,
        hasTrack: r.getBool('hasTrack')
      };
      if (!deleted) item.summary = jsonOf(r.getString('summary'));
      return item;
    });
  },
  auth
);

routerAdd(
  'GET',
  `${BASE}/clubs/{clubId}/flights/{key}/{kind}`,
  (e) => {
    const { KINDS, clubsEnabled, fail, find, sendTrack } = require(`${__hooks}/updraft.js`);
    const kind = e.request.pathValue('kind');
    const club = e.request.pathValue('clubId');
    // Every miss answers the same, so nobody learns what exists.
    const missing = () => fail(e, 404, 'Not found.');
    if (!clubsEnabled() || KINDS.indexOf(kind) < 0) return missing();
    if (!find($app, 'club_members', 'club = {:c} && user = {:u}', { c: club, u: e.auth.id })) return missing();

    const entry = find($app, 'club_entries', 'id = {:k} && club = {:c} && deleted = false', {
      k: e.request.pathValue('key'),
      c: club
    });
    const r =
      entry &&
      find($app, 'tracks', 'owner = {:o} && flight = {:f} && kind = {:k}', {
        o: entry.getString('owner'),
        f: entry.getString('flight'),
        k: kind
      });
    return r ? sendTrack(e, r) : missing();
  },
  auth
);

// A pilot who joins a club shows the flights already shared with it. One who leaves takes them out of the feed.
onRecordAfterCreateSuccess((e) => {
  const { syncClubs, jsonOf } = require(`${__hooks}/updraft.js`);
  const club = e.record.getString('club');
  const owner = e.record.getString('user');
  $app.runInTransaction((txApp) => {
    const flights = txApp.findRecordsByFilter(
      'items',
      'owner = {:o} && coll = "flights" && deleted = false',
      '',
      0,
      0,
      {
        o: owner
      }
    );
    for (const f of flights) {
      const data = jsonOf(f.getString('data'));
      if (data && Array.isArray(data.clubs) && data.clubs.indexOf(club) >= 0)
        syncClubs(txApp, owner, f.getString('iid'), data);
    }
  });
  e.next();
}, 'club_members');

onRecordAfterDeleteSuccess((e) => {
  const { nextSeq } = require(`${__hooks}/updraft.js`);
  $app.runInTransaction((txApp) => {
    const entries = txApp.findRecordsByFilter(
      'club_entries',
      'club = {:c} && owner = {:o} && deleted = false',
      '',
      0,
      0,
      {
        c: e.record.getString('club'),
        o: e.record.getString('user')
      }
    );
    for (const entry of entries) {
      entry.set('deleted', true);
      entry.set('summary', null);
      entry.set('seq', nextSeq(txApp));
      txApp.save(entry);
    }
  });
  e.next();
}, 'club_members');

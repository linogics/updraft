// Updraft sync HTTP spec v1, documented in docs/plugins/backend/server/openapi.yaml.
// Handlers run in isolated scopes, so each one loads the shared module itself.
const BASE = '/api/updraft/v1';
const auth = $apis.requireAuth('users');

routerAdd('GET', BASE, (e) => {
  const { MAX_CHANGES, MAX_PULL, oauthProviders } = require(`${__hooks}/updraft.js`);
  return e.json(200, {
    version: 1,
    auth: {
      password: true,
      signup: $os.getenv('UPDRAFT_SIGNUP') === 'true',
      oauth: oauthProviders().map((p) => ({ id: p.id, label: p.label }))
    },
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

// OAuth sign in for a popup. Start: redirect to the provider with state and PKCE saved in a cookie.
routerAdd('GET', `${BASE}/auth/redirect/{provider}`, (e) => {
  const { appOrigins, publicUrl, oauthProviders, OAUTH_COOKIE, OAUTH_PATH } = require(`${__hooks}/updraft.js`);
  const origin = e.request.url.query().get('origin') || '';
  if (appOrigins().indexOf(origin) < 0) throw new BadRequestError('origin is not allowed.');
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
      value: encodeURIComponent(JSON.stringify({ state, verifier, origin, provider: id })),
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

// OAuth sign in, step two. Always answers with a page that posts the result to the opener.
routerAdd('GET', `${BASE}/auth/callback`, (e) => {
  const { appOrigins, publicUrl, oauthProviders, resultPage, session, OAUTH_COOKIE, OAUTH_PATH } = require(
    `${__hooks}/updraft.js`
  );
  const q = e.request.url.query();

  let saved = null;
  try {
    saved = JSON.parse(decodeURIComponent(e.request.cookie(OAUTH_COOKIE).value));
  } catch (_) {
    // No cookie or a broken one.
  }
  e.setCookie(new Cookie({ name: OAUTH_COOKIE, value: '', path: OAUTH_PATH, maxAge: -1, httpOnly: true }));

  // Without a trusted cookie there is no origin to answer to, so nothing is posted anywhere.
  const state = q.get('state') || '';
  if (
    !saved ||
    typeof saved !== 'object' ||
    typeof saved.origin !== 'string' ||
    appOrigins().indexOf(saved.origin) < 0 ||
    typeof saved.state !== 'string' ||
    state === '' ||
    saved.state !== state
  )
    return e.html(
      400,
      '<!doctype html><meta charset="utf-8"><title>Updraft</title><p>Sign in failed. Start again from the app.</p>'
    );

  const fail = (message) => resultPage(e, saved.origin, { error: message });
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
  return resultPage(e, saved.origin, session(user));
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

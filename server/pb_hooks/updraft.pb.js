// Legacy sync route of the PocketBase plugin. The same logic serves /api/updraft/v1/push, see updraft.js.
routerAdd(
  'POST',
  '/api/updraft/push',
  (e) => {
    const body = e.requestInfo().body;
    require(`${__hooks}/updraft.js`).applyChanges(e.auth.id, body && body.changes);
    return e.json(200, { ok: true });
  },
  $apis.requireAuth('users')
);

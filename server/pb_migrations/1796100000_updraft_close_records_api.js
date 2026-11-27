// The app only talks to the /api/updraft/v1 routes, whose hooks run as superuser. Close PocketBase's own records
// API so shared rows and own rows are not readable or deletable around the hooks.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.listRule = null;
    records.viewRule = null;
    records.deleteRule = null;
    app.save(records);
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    const own = '@request.auth.id != "" && owner = @request.auth.id';
    const visible = '@request.auth.id != "" && (owner = @request.auth.id || shared = true)';
    records.listRule = visible;
    records.viewRule = visible;
    records.deleteRule = own;
    app.save(records);
  }
);

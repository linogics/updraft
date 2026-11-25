// Synced updraft records. One row per (owner, type, rid), the whole record in `data`.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Accounts are created by the admin. To allow public signup, set the users create rule to "" in the dashboard.
    users.createRule = null;
    app.save(users);

    const own = '@request.auth.id != "" && owner = @request.auth.id';
    const records = new Collection({
      type: 'base',
      name: 'records',
      listRule: own,
      viewRule: own,
      createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
      updateRule: `${own} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
      deleteRule: own,
      fields: [
        { type: 'relation', name: 'owner', required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
        {
          type: 'select',
          name: 'type',
          required: true,
          maxSelect: 1,
          values: ['flight', 'manual', 'cameraPath', 'pref']
        },
        { type: 'text', name: 'rid', required: true, max: 200 },
        { type: 'number', name: 'updatedAt', required: true },
        { type: 'bool', name: 'deleted' },
        // 20 MB, enough for long tracks.
        { type: 'json', name: 'data', maxSize: 20971520 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_records_owner_type_rid ON records (owner, type, rid)',
        'CREATE INDEX idx_records_owner_updated ON records (owner, updated)'
      ]
    });
    app.save(records);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('records'));

    const users = app.findCollectionByNameOrId('users');
    users.createRule = '';
    app.save(users);
  }
);

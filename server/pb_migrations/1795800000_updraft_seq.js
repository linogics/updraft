// A per-server sequence number for the pull cursor, and writes only through the push hook.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');

    records.fields.add(new NumberField({ name: 'seq', onlyInt: true }));
    records.addIndex('idx_records_owner_seq', false, 'owner, seq', '');
    // The hook runs as superuser, so clients lose direct write access.
    records.createRule = null;
    records.updateRule = null;
    app.save(records);

    // Same order as the old cursor, so existing clients keep a sensible history.
    app
      .db()
      .newQuery(
        'UPDATE records SET seq = n.rn FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY updated, id) AS rn FROM records) AS n WHERE records.id = n.id'
      )
      .execute();
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    const own = '@request.auth.id != "" && owner = @request.auth.id';

    records.createRule = '@request.auth.id != "" && @request.body.owner = @request.auth.id';
    records.updateRule = `${own} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`;
    records.removeIndex('idx_records_owner_seq');
    records.fields.removeByName('seq');
    app.save(records);
  }
);

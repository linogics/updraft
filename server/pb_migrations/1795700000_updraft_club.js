// Club sharing. A flight with `shared` set is readable by every signed in account, with a small `summary` for the list.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    const visible = '@request.auth.id != "" && (owner = @request.auth.id || shared = true)';

    records.fields.add(new BoolField({ name: 'shared' }));
    // 16 KB, the summary is a few numbers and short texts.
    records.fields.add(new JSONField({ name: 'summary', maxSize: 16384 }));
    records.listRule = visible;
    records.viewRule = visible;
    records.addIndex('idx_records_shared', false, 'shared', '');
    app.save(records);
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    const own = '@request.auth.id != "" && owner = @request.auth.id';

    records.listRule = own;
    records.viewRule = own;
    records.removeIndex('idx_records_shared');
    records.fields.removeByName('shared');
    records.fields.removeByName('summary');
    app.save(records);
  }
);

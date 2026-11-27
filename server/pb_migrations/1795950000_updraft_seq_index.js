// The push hook runs MAX(seq) over the whole table, so it needs a global index on seq.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.addIndex('idx_records_seq', false, 'seq', '');
    app.save(records);
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.removeIndex('idx_records_seq');
    app.save(records);
  }
);

// Storage of the sync spec v2. Every collection is closed (admin only), the hooks run as superuser and check
// ownership and club membership in code. Pilots only see their own data through the /api/updraft/v2 routes.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Accounts are created by the admin. Signup goes through the hook when UPDRAFT_SIGNUP is true.
    users.createRule = null;
    app.save(users);

    try {
      app.delete(app.findCollectionByNameOrId('records'));
    } catch (_) {
      // A fresh server has no v1 collection.
    }

    const owner = {
      type: 'relation',
      name: 'owner',
      required: true,
      collectionId: users.id,
      cascadeDelete: true,
      maxSelect: 1
    };

    // One server counter orders every write. Its value is the item version and the feed cursor.
    const counter = new Collection({
      type: 'base',
      name: 'sync_counter',
      fields: [{ type: 'number', name: 'n', onlyInt: true }]
    });
    app.save(counter);
    const first = new Record(counter);
    first.set('n', 0);
    app.save(first);

    app.save(
      new Collection({
        type: 'base',
        name: 'items',
        fields: [
          owner,
          { type: 'text', name: 'coll', required: true, max: 20 },
          { type: 'text', name: 'iid', required: true, max: 200 },
          { type: 'number', name: 'seq', onlyInt: true },
          { type: 'bool', name: 'deleted' },
          { type: 'json', name: 'data', maxSize: 2097152 },
          { type: 'json', name: 'times', maxSize: 1048576 },
          { type: 'bool', name: 'secret' }
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_items_owner_coll_iid ON items (owner, coll, iid)',
          'CREATE INDEX idx_items_owner_coll_seq ON items (owner, coll, seq)'
        ]
      })
    );

    // Track files live apart from the items, so a feed never loads them.
    app.save(
      new Collection({
        type: 'base',
        name: 'tracks',
        fields: [
          owner,
          { type: 'text', name: 'flight', required: true, max: 200 },
          { type: 'text', name: 'kind', required: true, max: 20 },
          { type: 'text', name: 'mime', max: 200 },
          { type: 'file', name: 'file', required: true, maxSelect: 1, maxSize: 104857600, protected: true }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_tracks_owner_flight_kind ON tracks (owner, flight, kind)']
      })
    );

    // The admin creates clubs and adds members in the dashboard. The app never does.
    const clubs = new Collection({
      type: 'base',
      name: 'clubs',
      fields: [{ type: 'text', name: 'name', required: true, max: 200 }]
    });
    app.save(clubs);
    app.save(
      new Collection({
        type: 'base',
        name: 'club_members',
        fields: [
          { type: 'relation', name: 'club', required: true, collectionId: clubs.id, cascadeDelete: true, maxSelect: 1 },
          { type: 'relation', name: 'user', required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_club_members_club_user ON club_members (club, user)']
      })
    );

    // One row per shared flight and club. The row id is the opaque key of the club routes.
    app.save(
      new Collection({
        type: 'base',
        name: 'club_entries',
        fields: [
          { type: 'text', name: 'club', required: true, max: 50 },
          {
            type: 'relation',
            name: 'owner',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1
          },
          { type: 'text', name: 'flight', required: true, max: 200 },
          { type: 'number', name: 'seq', onlyInt: true },
          { type: 'bool', name: 'deleted' },
          { type: 'json', name: 'summary', maxSize: 16384 },
          { type: 'bool', name: 'hasTrack' }
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_club_entries_club_owner_flight ON club_entries (club, owner, flight)',
          'CREATE INDEX idx_club_entries_club_seq ON club_entries (club, seq)'
        ]
      })
    );
  },
  (app) => {
    for (const name of ['club_entries', 'club_members', 'clubs', 'tracks', 'items', 'sync_counter']) {
      app.delete(app.findCollectionByNameOrId(name));
    }

    const users = app.findCollectionByNameOrId('users');
    users.createRule = '';
    app.save(users);
  }
);

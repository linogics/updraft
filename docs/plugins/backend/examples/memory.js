// A tiny in-memory sync backend. It forgets everything on reload, so it is a template, not a real server.
// Sign in with the identity `demo@example.com` and the password `demo`.
const DEMO = { identity: 'demo@example.com', password: 'demo' };
const PAGE = 100;

export default {
  id: 'acme/memory',
  name: 'Memory backend',
  kind: 'backend',
  apiVersion: 1,
  create: (config) => {
    // One row per record. `seq` grows with every accepted change and is the pull cursor.
    /** @type {Map<string, { change: object, seq: number }>} */
    const rows = new Map();
    let seq = 0;
    let session = null;

    return {
      authMethods: async () => [{ kind: 'password' }],
      async signIn(method, input = {}) {
        if (input.identity !== DEMO.identity || input.password !== DEMO.password) {
          throw new Error('Wrong identity or password.');
        }

        session = { user: DEMO.identity };
        return session;
      },
      signOut: async () => {
        session = null;
      },
      session: () => session,
      async push(changes) {
        for (const change of changes) {
          const key = `${change.type}:${change.id}`;
          // Last write wins per record.
          if ((rows.get(key)?.change.updatedAt ?? -Infinity) < change.updatedAt) {
            rows.set(key, { change, seq: ++seq });
          }
        }
      },
      async pull(cursor) {
        const after = Number(cursor ?? 0);
        const page = [...rows.values()]
          .filter((r) => r.seq > after)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, PAGE + 1);
        const more = page.length > PAGE;
        const items = page.slice(0, PAGE);
        return {
          changes: items.map((r) => r.change),
          cursor: items.length ? String(items.at(-1).seq) : cursor,
          more
        };
      }
    };
  }
};

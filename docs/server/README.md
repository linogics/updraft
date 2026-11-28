# Sync server spec v2

You can write your own sync server in any language. If it follows this spec, a client that speaks v2 works with it as is. The app speaks v2, and so does the PocketBase reference server in `server/`.

This guide tells the story and explains the reasons. Every exact rule (statuses, headers, fields) lives in the [reference](reference.md).

## Files

- [openapi.yaml](openapi.yaml) is the source of truth.
- [reference.md](reference.md) is generated from it. Do not edit it.
- `src/lib/sync/v2/openapi.d.ts` is the typed client code, generated from the same file.
- Run `npm run docs:api` after you change the spec. CI fails when the generated files differ.

## What the spec covers

Only what the app needs: sign in, three collections of items (`flights`, `camera-paths`, `prefs`), track files and reading the flights of a club.

Not in the spec, because they are server business:

- creating clubs, adding or removing members, roles
- account self service such as delete, export or password change

A server is free to offer these in its own admin UI or its own routes. The app never calls them.

## A sync session

1. **Discover.** The client calls [`GET /`](reference.md#getcapabilities) and only uses what the server announces: password or OAuth sign in, signup, clubs and the size limits. See [Capabilities](reference.md#schema-capabilities) for what the client does with each field.
2. **Sign in.** With a password, the client posts to [`/auth/password`](reference.md#signinwithpassword) and gets a [Session](reference.md#schema-session) with an opaque token. With OAuth, it opens a popup at [`/auth/redirect/{provider}`](reference.md#oauthredirect) and gets the same session back through [`/auth/callback`](reference.md#oauthcallback). The token goes into `Authorization: Bearer` on every other call.
3. **Catch up.** For each collection the client calls [`GET /{collection}`](reference.md#listchanges) with the last cursor it stored, and keeps asking while `more` is true. It applies the items and tombstones to its local copy.
4. **Write.** The client sends [`PUT /{collection}/{id}`](reference.md#putitem) with `If-None-Match: *` to create or `If-Match` to update. On a 412 the answer holds the current item. The client merges and tries again.
5. **Upload tracks.** For a flight with a file, the client sends the original file with [`PUT /flights/{id}/track`](reference.md#puttrack) and the parsed fixes with [`PUT /flights/{id}/track.json`](reference.md#puttrackjson). Another device fetches them with the matching `GET`.
6. **Read a club.** With `clubs: true`, [`GET /clubs`](reference.md#listclubs) lists the clubs and [`GET /clubs/{clubId}/flights`](reference.md#listclubflights) is a feed of the shared flights, with its own track routes.

An item looks the same in every collection:

```json
{
  "id": "2026-07-14T10-02-11",
  "version": "42",
  "deleted": false,
  "data": { "name": "Bassano", "hasTrack": true },
  "times": { "name": 1784023331000, "hasTrack": 1784023331000 }
}
```

`data` is opaque to the server. `times` says when each top level field of `data` last changed, by the client clock. See [Item](reference.md#schema-item) and [FlightData](reference.md#schema-flightdata) for the rules.

## Why it works this way

### Versions and preconditions

Two devices of one pilot write the same item. Without a check the later request silently wins and the other change is lost. So every write is conditional, on the item version. A server that checks the version and stores the write in one step cannot lose a change. A delete keeps a tombstone with a new version, so a device that was offline still learns about it and cannot bring the item back by accident. See [`PUT /{collection}/{id}`](reference.md#putitem) and [`DELETE /{collection}/{id}`](reference.md#deleteitem).

### Why the client merges

The server stores `data` and `times` as is and never merges. It does not know what the fields mean, and it should not need to. On a 412 the client does a per field last write wins:

1. Take the current item from the 412 body.
2. For every field, keep the value whose `times` entry is newer. Without an entry the field counts as oldest.
3. Retry the write with `If-Match` set to the current version.

Two devices that change different fields of one flight both keep their change. Two devices that change the same field keep the newer one, by the client clocks. Every server then behaves the same, and the merge rules can change without a server update.

### Cursors, not offsets

An offset moves while items are written, so a feed would skip or repeat items. A cursor is a position that stays correct. A server can answer it with an index seek and does not count rows. The cursor is opaque, so a server may change its format or lose its history. The client treats a 400 on a stored cursor as "start again from the beginning". Replaying is safe: a clean local item takes the server copy, and an unsynced local edit merges field by field by `times`. A replay costs time, not edits. See [`GET /{collection}`](reference.md#listchanges).

### Tracks are written once

Tracks are big. An immutable file can be cached for ever, uploaded without a version dance and never conflicts. A changed track is a new flight. The server never parses a file, so new file formats need no server update. See [`PUT /flights/{id}/track`](reference.md#puttrack).

### Club 404s look the same

A club answers 404 for an unknown club, a pilot who is not a member, and an unknown, unshared or deleted flight. If the answers differed, a pilot could probe which clubs and flights exist. The feed carries only the summary of a flight and never its data, and the server keeps that summary next to the flight, so a club feed stays cheap. See [`GET /clubs/{clubId}/flights`](reference.md#listclubflights).

### OAuth result in the fragment

The server does the OAuth work, and the app only gets the session at the end. Each part of the flow has a reason:

- The result is in the URL fragment, so no server, proxy or log ever sees the token.
- The app uses a `BroadcastChannel` and not `window.opener`, because providers send `Cross-Origin-Opener-Policy` headers that cut `window.opener`.
- The `app_state` check lets the app ignore a result that is not its own.
- The allow list of app origins stops a hostile site from receiving a token.
- The cookie, the PKCE verifier and the server made `state` tie the callback to the browser that started the sign in.

The exact steps are in [`/auth/redirect/{provider}`](reference.md#oauthredirect) and [`/auth/callback`](reference.md#oauthcallback).

## Checklist for an implementer

- Offer at least one way to sign in, see [Capabilities](reference.md#schema-capabilities).
- Rate limit the auth routes and answer 429 with `Retry-After`, see [Common responses](reference.md#common-responses).
- Set up CORS for the app origin, see the [global rules](reference.md#global-rules).
- Check the body size before you read the body and answer 413, see [`PUT /{collection}/{id}`](reference.md#putitem).
- Keep secret prefs out of logs and every other route, see [`PUT /{collection}/{id}`](reference.md#putitem).
- Use opaque cursors, never offsets, and answer 400 for one you do not know, see [`GET /{collection}`](reference.md#listchanges).
- Check the version and write in one step, so two devices cannot both win.
- Give every club answer the same 404 shape, see [`GET /clubs/{clubId}/flights`](reference.md#listclubflights).

## Testing your server

`src/lib/sync/v2/contract.test.ts` checks a running server with plain `fetch`, so it works with any implementation. It also validates every JSON answer against the response schema in [openapi.yaml](openapi.yaml). Run it with:

```sh
npm run contract -- --url http://127.0.0.1:8090 --token <t> [--token2 <t>] [--club <id>]
```

- `--url` is the server address without the base path.
- `--token` is the bearer token of an account the test may write to. The test creates only items with ids that start with `contract-` and a random part, and deletes them at the end. The tombstones stay.
- `--token2` is a second account. It enables the isolation tests and the club tests.
- `--club` is the id of a club both accounts belong to. Without it the club tests are skipped.
- The test waits and retries on 429, so rate limits are fine.

The same suite runs in CI against `src/lib/sync/v2/memory-server.ts`, a small in-memory server that follows the spec. Read it if you want to see what a minimal implementation looks like.

## Reference implementation

The PocketBase kit in `server/`, set up as described in [self-hosting-sync.md](../self-hosting-sync.md). It passes the contract suite, club tests included.

| File                                       | What it does                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `server/pb_hooks/updraft-v2.pb.js`         | All routes of the spec.                                                                                   |
| `server/pb_hooks/updraft.js`               | Shared code: the version check with its counter in one transaction, club entries, tracks, OAuth, limits.  |
| `server/pb_migrations/*.js`                | The collections `items`, `tracks`, `sync_counter`, `clubs`, `club_members`, `club_entries` and the rate limiter settings. |
| `server/compose.yaml`, `server/Dockerfile` | Runs PocketBase with the hooks and migrations mounted.                                                    |
| `scripts/seed-contract.mjs`                | Creates two pilots and a club they share, for the contract suite.                                         |

How it keeps the promises of the spec:

- One counter (`sync_counter`) numbers every write of items and club entries. Its value is the item `version` and the feed cursor, so a cursor is only valid up to the counter, and a bigger one answers 400.
- The version check and the counter run in one transaction, so two devices cannot both win.
- Track files are stored in the `tracks` collection as file fields, apart from the items, so feeds never load them.
- Club entries (`club_entries`) hold the summary and an opaque key per flight and club. The key is the row id.
- The auth routes are limited to 2 requests per 3 seconds per client IP in the hooks, with `Retry-After`. The other routes only have PocketBase's general limit, which does not send `Retry-After`.
- Limits: `maxPage` 200, `maxItemBytes` 1 MB, `maxTrackBytes` 20 MB.

To run the contract suite against a local container (signup must be on, see [self-hosting-sync.md](../self-hosting-sync.md#development)):

```sh
docker build -t updraft-server server
docker run -d --name pb -p 8090:8090 -e UPDRAFT_SIGNUP=true \
  -v "$PWD/server/pb_migrations:/pb/pb_migrations" -v "$PWD/server/pb_hooks:/pb/pb_hooks" updraft-server
docker exec pb pocketbase superuser upsert admin@example.org a-long-password --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
eval "$(node scripts/seed-contract.mjs --url http://localhost:8090 --admin admin@example.org --password a-long-password)"
npm run contract -- --url http://localhost:8090 --token "$T1" --token2 "$T2" --club "$CLUB"
```

# Sync server spec v2 (draft)

You can write your own sync server in any language. If it follows this spec, a client that speaks v2 works with it as is. The app speaks v2. The older [v1](../plugins/backend/server/README.md) is only kept for the PocketBase kit until it moves to v2.

## Overview

- The source of truth is [openapi.yaml](openapi.yaml). This guide explains it and adds the reasons.
- [reference.md](reference.md) lists every operation and schema. It is generated from the spec, do not edit it.
- The spec version is `2`. All routes live under the base path `/api/updraft/v2`. The client takes the server address a user enters, for example `https://sync.example.com`, and adds the base path.
- Everything is JSON, except track files. Errors are JSON with a `message` string.
- Typed client code is generated from the spec into `src/lib/sync/v2/openapi.d.ts`. Run `npm run docs:api` after you change the spec.

## What the spec covers

Only what the app needs: sign in, three collections of items, track files and reading the flights of a club.

Not in the spec, because they are server business:

- creating clubs, adding or removing members, roles
- account self service such as delete, export or password change

A server is free to offer these in its own admin UI or its own routes. The app never calls them.

## Routes

| Route                                               | Needs token | Notes                                  |
| --------------------------------------------------- | ----------- | -------------------------------------- |
| `GET /`                                             | No          | Capabilities.                          |
| `POST /auth/password`, `POST /auth/signup`          | No          | Optional, see capabilities.            |
| `GET /auth/redirect/{provider}`, `GET /auth/callback` | No        | Optional, OAuth.                       |
| `GET /{collection}`                                 | Yes         | Catch-up feed.                         |
| `GET`, `PUT`, `DELETE /{collection}/{id}`           | Yes         | One item.                              |
| `GET`, `PUT /flights/{id}/track` and `track.json`   | Yes         | Track files.                           |
| `GET /clubs`                                        | Yes         | Only with `clubs: true`.               |
| `GET /clubs/{clubId}/flights`                       | Yes         | Only with `clubs: true`.               |
| `GET /clubs/{clubId}/flights/{key}/track`, `track.json` | Yes     | Only with `clubs: true`.               |

`{collection}` is `flights`, `camera-paths` or `prefs`. A route whose capability is off answers 403 or 404.

## Capabilities

The client calls `GET /api/updraft/v2` first and only uses what the server announces. Example:

```json
{
  "version": 2,
  "auth": { "password": true, "signup": false, "oauth": [{ "id": "github", "label": "GitHub" }] },
  "clubs": true,
  "limits": { "maxPage": 200, "maxItemBytes": 20000000, "maxTrackBytes": 50000000 }
}
```

| Field                  | What the client does with it                                                          |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `version`              | Must be `2`. Anything else is refused.                                                |
| `auth.password`        | Shows the email and password form.                                                    |
| `auth.signup`          | Shows **Create account** next to the form.                                            |
| `auth.oauth`           | One sign in button per entry. `id` goes into `/auth/redirect/{provider}`.             |
| `clubs`                | Offers the club routes. Without it the app has no club.                               |
| `limits.maxPage`       | Largest feed page. The client asks for at most this many.                             |
| `limits.maxItemBytes`  | Largest body of an item write.                                                        |
| `limits.maxTrackBytes` | Largest track upload. Bigger bodies answer 413.                                       |

A useful server needs at least one way to sign in: password, or an OAuth provider.

## Auth

Every route except the capabilities and the auth routes needs `Authorization: Bearer <token>`. The token is opaque. It comes from a sign in answer:

```json
{ "token": "eyJhbGciOi...", "user": { "id": "k3m9x2q7w1p5z8a", "name": "pilot@example.org" } }
```

- `POST /auth/password` takes `{ "identity": "pilot@example.org", "password": "..." }`. It answers 200 with the session, 400 for a missing field and 401 for a wrong email or password. Answer an unknown email like a wrong password.
- `POST /auth/signup` takes `{ "email": "...", "password": "..." }`. It answers 200 with the session, 403 when signup is off and 400 when the email is invalid or taken or the password is shorter than 8 characters.
- Token lifetime is the server's choice. There is no refresh. On a 401 the client forgets the token and asks the pilot to sign in again.
- Rate limit the auth routes, they are open to the internet. Answer 429 with `Retry-After`.

## Items

The server stores three collections per account.

| Collection     | Holds                                          |
| -------------- | ---------------------------------------------- |
| `flights`      | Logbook flights, with a track or manual.       |
| `camera-paths` | Saved 3D camera paths.                         |
| `prefs`        | Settings. The item id is the pref key.         |

An item looks the same everywhere:

```json
{
  "id": "2026-07-14T10-02-11",
  "version": "42",
  "deleted": false,
  "data": { "name": "Bassano", "hasTrack": true },
  "times": { "name": 1784023331000, "hasTrack": 1784023331000 }
}
```

| Field     | Rule                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `id`      | String, 1 to 200 characters. Chosen by the client.                                                        |
| `version` | Opaque string. Changes on every write, also on a delete. The `ETag` header shows it in double quotes.      |
| `deleted` | `true` for a tombstone. A tombstone has no `data` and no `times`.                                         |
| `data`    | The record. Opaque to the server, store it as is.                                                         |
| `times`   | Maps a top level field of `data` to the client clock in milliseconds when it last changed.                |
| `secret`  | Only on `prefs`. See below.                                                                               |

### Why versions and preconditions

Two devices of one pilot write the same item. Without a check the later request silently wins and the other change is lost. So every write is conditional:

- Create needs `If-None-Match: *`. It fails with 412 when the item exists, also as a tombstone.
- Update needs `If-Match: "<version>"`. It fails with 412 when the version is not the current one.
- A write with neither header answers 428. An `If-Match` on an item that never existed answers 404.
- The 412 answer carries the current item as its body, so the client does not need another request.
- `DELETE` needs `If-Match` too. It answers 204 and keeps a tombstone, so other devices learn about the delete.
- Writing a tombstone with `If-Match` on the tombstone version revives the item.
- `GET /{collection}/{id}` answers 404 only when the item never existed. A deleted item answers 200 with the tombstone.

### Why the client merges

The server stores `data` and `times` as is and never merges. It does not know what the fields mean, and it should not need to. On a 412 the client does a per field last write wins:

1. Take the current item from the 412 body.
2. For every field, keep the value whose `times` entry is newer. Without an entry the field counts as oldest.
3. Retry the write with `If-Match` set to the current version.

Two devices that change different fields of one flight both keep their change. Two devices that change the same field keep the newer one, by the client clocks.

### Known fields

Everything in `data` is opaque except these fields of `flights`:

- `clubs`: ids of the clubs the flight is shared with.
- `club`: a small summary object shown in club feeds, for example `{ "km": 42.1 }`.
- `hasTrack`: `false` for a manual logbook flight without a track.

Manual flights live in `flights` too.

### Secret prefs

A pref may be written with `"secret": true`. The client does this for `cesiumIonToken` and `openaipKey`, and only after the pilot opted in to syncing them. The server must keep them out of its logs and never expose them in another route, for example a club feed or an admin export.

## Feed

`GET /{collection}?since=<cursor>&limit=<n>` is how a device catches up.

- The answer is `{ "items": [...], "cursor": "...", "more": true }`. Items are the changed and the deleted ones of the signed in account, in a stable server order. They carry `data` and `times` but never track bytes.
- The cursor is an opaque string. The client stores it and sends it back as `since`. No `since` starts at the beginning.
- An empty page returns the sent cursor, or `null` when none was sent. `more` is true when the page is full. The client keeps asking while `more` is true.
- `limit` is 1 to `limits.maxPage` and defaults to `limits.maxPage`.
- A malformed cursor, a cursor the server does not know and a bad `limit` all answer 400. After that the client starts again from the beginning. This is why a server may change its cursor format or lose its history.
- Use cursors, never offsets. A cursor stays correct while items are written, and a server can answer it with an index seek.

## Tracks

Only for `flights`. There are two files per flight, each written once and never changed.

- `PUT /flights/{id}/track` takes the original file bytes (IGC, GPX, FIT, KML and more) with any `Content-Type`. The server stores and serves it back with that type.
- `PUT /flights/{id}/track.json` takes the parsed fixes, `{ "fixes": [{ "t": ..., "lat": ..., "lon": ..., "alt": ... }] }`. It saves other devices the work of parsing.
- The server never parses either file.
- Both need `If-None-Match: *`. A second upload answers 412. A missing header answers 428.
- The flight item must exist and not be deleted, otherwise 404. A body over `limits.maxTrackBytes` answers 413. Success answers 201.
- `GET` answers 200 with the bytes, or 404 when absent.
- Deleting the flight deletes its tracks.

Why write once: tracks are big. An immutable file can be cached for ever, uploaded without a version dance and never conflicts. A changed track is a new flight.

## Clubs

Optional, with `clubs: true`. Creating clubs and managing members is the server's business, the app only reads.

A flight is shared with a club when its `data.clubs` lists the club id. The server keeps the club id and the `data.club` summary next to the flight, so a club feed never has to load the heavy `data`.

- `GET /clubs` answers `{ "clubs": [{ "id": "...", "name": "..." }] }`, the clubs of the signed in pilot.
- `GET /clubs/{clubId}/flights?since=&limit=` is a feed with the same cursor rules as above. Items are `{ key, owner, mine, version, deleted, summary, hasTrack }`.
  - `key` is opaque and is not the id of the owner's item. It is the handle for the track routes.
  - `owner` is an opaque account id. The app groups the flights of one pilot by it.
  - `mine` is true when the signed in account owns the flight.
  - An unshare, a delete and a member who left show as `deleted: true`, so clients can drop them.
- `GET /clubs/{clubId}/flights/{key}/track` and `track.json` serve the files.
- Answer 404 when the club is unknown or the pilot is not a member, and the same 404 for an unknown, unshared or deleted flight. All cases must look the same, so nobody learns what exists.

## OAuth sign in (optional)

The app signs in through a popup with a provider such as Google or GitHub. The server does the OAuth work and gives the app the same session as a password sign in. Steps:

1. The server lists the provider in `auth.oauth`.
2. On a click the app opens a popup at `GET /auth/redirect/{provider}?origin=<app origin>&app_state=<random>`. `app_state` is a random value the app made, 22 to 128 base64url characters.
3. The server checks `origin` against its allow list of exact app origins and `app_state` against `^[A-Za-z0-9_-]{22,128}$`. It answers 400 for either, 404 for an unknown provider.
4. The server makes its own random `state` and a PKCE verifier. It saves `state`, the verifier, `origin`, `app_state` and the provider in a cookie. The cookie has path `/api/updraft/v2/auth`, `HttpOnly`, `SameSite=Lax`, `Secure` on https and a lifetime of 10 minutes. `Lax` is needed so the cookie comes back on the provider's redirect.
5. The server redirects (302) to the provider with `state` and a PKCE challenge (method `S256`). The redirect URL registered at the provider is `<public url>/api/updraft/v2/auth/callback`. The public url is configured on the server and never read from the request, so a forged `Host` header cannot steer the redirect.
6. The provider redirects the popup to `GET /auth/callback?code=...&state=...`.
7. The server reads the cookie, deletes it and compares `state`. If the cookie is missing, expired or does not match, there is no trusted origin. Answer 400 with a plain page and do not redirect.
8. The server exchanges `code` for a token with the PKCE verifier and fetches the provider account. It matches a server account: first by an earlier link of that provider account, then by the same email, which it then links. When nothing matches it creates an account only if `auth.signup` is true. Otherwise the sign in fails with "No account matches your <provider label> email. Ask the server admin to create one with that email."
9. The server redirects (302) to `<origin>/oauth-callback.html#<result>` with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. `origin` is the allowed origin from the cookie, never from the query. `<result>` is `encodeURIComponent(JSON.stringify(message))`. `message` is one of:

```json
{ "type": "updraft-auth", "state": "<app_state>", "token": "...", "user": { "id": "...", "name": "..." } }
```

```json
{ "type": "updraft-auth", "state": "<app_state>", "error": "A message that is safe to show." }
```

10. The page `/oauth-callback.html` ships with the app. It reads the fragment, removes it from the address bar, posts the message on a `BroadcastChannel` named `updraft-auth` and closes the popup. The app accepts the message only if `type` is `updraft-auth` and `state` equals its own `app_state`.

Why this shape:

- The result is in the URL fragment, so no server, proxy or log ever sees the token.
- The app uses a `BroadcastChannel` and not `window.opener`, because providers send `Cross-Origin-Opener-Policy` headers that cut `window.opener`.
- The `app_state` check lets the app ignore a result that is not its own.
- The allow list stops a hostile site from receiving a token.

## Scale and limits

- Feeds use cursors, not offsets, and are capped by `limits.maxPage`.
- Answer 429 and 503 with a `Retry-After` header in seconds. The client waits and tries again. A server may also send `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
- Answer 413 for bodies over `limits.maxItemBytes` and `limits.maxTrackBytes`. Check the size before you read the whole body.
- The client is a web page on another origin. CORS must allow the app origin and the headers `Authorization`, `If-Match`, `If-None-Match` and `Content-Type`, and expose `ETag` and `Retry-After`.

## Errors

Answer errors with a status code and JSON `{ "message": "..." }`. Extra fields are ignored. The app shows `message` as is.

| Status | Meaning                                                                                      |
| ------ | -------------------------------------------------------------------------------------------- |
| 400    | Bad input: invalid body, bad cursor or limit, bad signup, bad OAuth start.                   |
| 401    | Missing, wrong or expired token, or a wrong password.                                        |
| 403    | The route is off, for example signup or clubs.                                               |
| 404    | Unknown item, track, club or provider. An `If-Match` on an item that never existed.          |
| 412    | The precondition failed. On items the body is the current item.                              |
| 413    | The body is too large.                                                                       |
| 428    | A write without `If-Match` or `If-None-Match`.                                               |
| 429    | Rate limited. Has `Retry-After`.                                                             |
| 503    | Busy. Has `Retry-After`.                                                                     |

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

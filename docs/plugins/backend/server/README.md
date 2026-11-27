# Sync server spec

This is v1. The draft of v2 is in the [sync server spec v2 guide](../../../server/README.md).

You can write your own sync server in any language. If it follows this spec, the bundled backend `updraft/http` works with it as is. You do not need to write a plugin. Plugins are only for backends that speak something else, see [backend plugins](../README.md).

## Overview

- The source of truth is [openapi.yaml](openapi.yaml). This guide explains it and adds the reasons.
- The spec version is `1`. All routes live under the base path `/api/updraft/v1`. The app takes the server address a user enters, for example `https://sync.example.com`, and adds the base path.
- Everything is JSON. Errors are JSON with a `message` string.
- The reference server is a PocketBase kit in `server/`, see [Reference implementation](#reference-implementation).

## Required and optional routes

| Route                        | Required | Capability flag                 | Needs token |
| ---------------------------- | -------- | ------------------------------- | ----------- |
| `GET /`                      | Yes      | none                            | No          |
| `POST /push`                 | Yes      | none                            | Yes         |
| `GET /pull`                  | Yes      | none                            | Yes         |
| `POST /auth/password`        | Optional | `auth.password`                 | No          |
| `POST /auth/signup`          | Optional | `auth.signup`                   | No          |
| `GET /auth/redirect/{provider}` | Optional | `auth.oauth` lists the provider | No       |
| `GET /auth/callback`         | Optional | `auth.oauth` is not empty       | No          |
| `GET /club`                  | Optional | `club`                          | Yes         |
| `GET /club/{key}`            | Optional | `club`                          | Yes         |

Paths are relative to `/api/updraft/v1`. A route whose capability is off answers 403 or 404. A 404 on `GET /`, `POST /push` or `GET /pull` makes the app report that the server kit is outdated.

A useful server needs at least one way to sign in: password, or an OAuth provider.

## Capabilities

The app calls `GET /api/updraft/v1` first and only uses what the server announces. The route needs no token. Example:

```json
{
  "version": 1,
  "auth": {
    "password": true,
    "signup": false,
    "oauth": [{ "id": "github", "label": "GitHub" }]
  },
  "club": true,
  "limits": { "maxChanges": 200, "maxPull": 1000 }
}
```

| Field                  | What the app does with it                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `version`              | Must be `1`. Anything else is refused with "This server does not speak the Updraft sync spec v1."         |
| `auth.password`        | Shows the email and password form.                                                                         |
| `auth.signup`          | Shows **Create account** next to the form.                                                                 |
| `auth.oauth`           | One sign in button per entry. `id` goes into `/auth/redirect/{provider}`, `label` is the button text.       |
| `club`                 | Offers the club to the app and uses `/club` and `/club/{key}`. Without it the app has no club.                              |
| `limits.maxChanges`    | Most changes in one push. Required by the spec.                                                            |
| `limits.maxPull`       | Largest pull page. Required by the spec.                                                                   |

Fields the app does not know are ignored. Missing or non boolean flags count as off. The app currently does not read `limits`. It sends at most 200 changes per push and asks for pages of 200, so keep both limits at 200 or higher.

## Auth

Every route except the capabilities and the auth routes needs `Authorization: Bearer <token>`. The token is opaque to the app. It comes from a sign in answer:

```json
{ "token": "eyJhbGciOi...", "user": { "id": "k3m9x2q7w1p5z8a", "name": "pilot@example.org" } }
```

`user.name` is a label the app shows, such as the email. `user.id` is not shown.

- `POST /auth/password` takes `{ "identity": "pilot@example.org", "password": "..." }`. `identity` is the email. It answers 200 with the session, 400 for a missing field and 401 for a wrong email or password. Answer an unknown email like a wrong password.
- `POST /auth/signup` takes `{ "email": "...", "password": "..." }`. It answers 200 with the session. It answers 403 when signup is off. It answers 400 when the email is invalid or taken, or the password is shorter than 8 characters.
- Token lifetime is the server's choice. The app has no refresh. When an authenticated call answers 401, the app forgets the token and shows "Signed out, sign in again."
- The app stores the token in `localStorage` per server address.
- Rate limit the auth routes, they are open to the internet. The reference server allows 2 requests per 3 seconds on `/api/updraft/v1/auth/` and answers 429. Do the same on the OAuth routes.
- The app is a web page on another origin, so the server must allow CORS for it, including the `Authorization` header.

## Records and sync semantics

A `SyncChange` is the unit of sync:

```json
{ "type": "flight", "id": "2026-07-14T10-02-11", "updatedAt": 1784023331000, "data": { "...": "..." } }
```

| Field       | Rule                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `type`      | One of `flight`, `manual`, `cameraPath`, `pref`.                                                    |
| `id`        | String, 1 to 200 characters.                                                                        |
| `updatedAt` | Finite number, the client clock in milliseconds. Decides last write wins.                           |
| `deleted`   | Optional boolean. `true` marks a tombstone. Pulled deletes always carry `true`.                     |
| `data`      | The record. Absent on a delete.                                                                     |

Rules:

- **Last write wins** per (account, `type`, `id`). A pushed change replaces the stored record only when its `updatedAt` is strictly greater. An equal or older change is dropped without an error. It does not get a sequence number and never moves a cursor.
- **Deletes are tombstones.** Keep the row with `deleted: true` and no data, so other devices learn about the delete. A later change with a higher `updatedAt` brings the record back.
- **Cursor.** Every accepted change gets the next number of a counter. The reference server uses one counter for the whole server. A per account counter works too. `pull` returns records in that order. The cursor is a string of digits, opaque to the app. It stores the one you return and sends it back. An unknown cursor, for example an old one from another kind of server, makes the app pull from the beginning.
- **Own records only.** Push stores into the signed in account. Pull never returns another account's records.
- **Push** takes `{ "changes": [...] }`. Apply the changes in order. Do it in one transaction, so the check and the counter cannot race. Answer 200 with `{}`. If the array is longer than `limits.maxChanges` (the app sends 200 at most) or one change is invalid, answer 400 and store nothing. The app also keeps each request under 16 MB, so allow bodies of at least that size and answer 413 beyond your limit. The reference server accepts 32 MB.
- **Pull** is `GET /pull?cursor=<n>&limit=<n>`. Both are optional. `limit` is 1 to `limits.maxPull`, default 200, the app asks for 200. A bad cursor or limit answers 400. The answer is `{ "changes": [...], "cursor": "...", "more": true }`. `cursor` is the position of the last row of the page. On an empty page it is the cursor that was sent, or `null` when none was. `more` is true when the page was full. The app keeps pulling while `more` is true.
- **Do not trust or interpret `data`.** Store it as is, up to a size limit you choose. The reference server accepts 20 MB per record because tracks are big. The only fields a server reads are the flight sharing fields below.

Example push and pull with curl:

```sh
BASE=https://sync.example.com/api/updraft/v1
TOKEN=eyJhbGciOi...

curl -s -X POST "$BASE/push" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"changes":[
    {"type":"pref","id":"units","updatedAt":1784023331000,"data":{"speed":"kmh"}},
    {"type":"flight","id":"f-1","updatedAt":1784023340000,"deleted":true}
  ]}'
# {}

curl -s "$BASE/pull?limit=200" -H "Authorization: Bearer $TOKEN"
# {"changes":[
#   {"type":"pref","id":"units","updatedAt":1784023331000,"data":{"speed":"kmh"}},
#   {"type":"flight","id":"f-1","updatedAt":1784023340000,"deleted":true}
# ],"cursor":"2","more":false}

curl -s "$BASE/pull?cursor=2" -H "Authorization: Bearer $TOKEN"
# {"changes":[],"cursor":"2","more":false}
```

## Club

The club lets pilots share single flights with every account on the server. A flight is shared when it is a `flight` change, not deleted, and `data.shared === true`. The summary is `data.club`. The owner's client sets both.

To support the club, set `club: true` and keep two things next to each record: whether it is shared and its summary. That lets the list skip the heavy `data`. A delete or a change without `data.shared === true` unshares the flight.

- `GET /club` lists the shared flights of all accounts, oldest first, without track data. It is not paged. Answer `{ "flights": [{ "key": "f3k9...", "owner": "k3m9x2q7w1p5z8a", "mine": true, "stats": { "km": 42.1 } }] }`.
  - `key` is an opaque id for `GET /club/{key}`.
  - `owner` is an opaque account id. The app groups the flights of one pilot by it.
  - `mine` is true when the signed in account owns the flight.
  - `stats` is the `data.club` summary as the owner's client sent it, or `null` when there was none.
- `GET /club/{key}` answers `{ "data": <the full flight record> }`.
- Answer 404 for an unknown key and for a flight that is not shared or was deleted. The two cases must look the same, so a key does not reveal that a private flight exists.
- All club routes need a token. Answer 403 when `club` is off.

## OAuth sign in (optional)

The app signs in through a popup with a provider such as Google or GitHub. The server does the OAuth work and gives the app the same session as a password sign in. Steps:

1. The server lists the provider in `auth.oauth`. The reference server only does this when it knows the allowed app origins and its own public address.
2. On a click the app opens a popup at `GET /auth/redirect/{provider}?origin=<app origin>&app_state=<random>`. `app_state` is a random value the app made, at least 22 and at most 128 base64url characters.
3. The server checks `origin` against its allow list of exact app origins and `app_state` against `^[A-Za-z0-9_-]{22,128}$`. It answers 400 for either, 404 for an unknown provider.
4. The server makes its own random `state` and a PKCE verifier. It saves `state`, the verifier, `origin`, `app_state` and the provider in a cookie. The reference cookie is named `updraft_oauth`, with path `/api/updraft/v1/auth`, `HttpOnly`, `SameSite=Lax`, `Secure` on https and a lifetime of 10 minutes. `Lax` is needed so the cookie comes back on the provider's redirect.
5. The server redirects (302) to the provider with `state` and a PKCE challenge (`code_challenge` with method `S256`). The redirect URL registered at the provider is `<public url>/api/updraft/v1/auth/callback`. The public url is configured on the server and never read from the request, so a forged `Host` header cannot steer the redirect.
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

The app gives up after 5 minutes and shows "Sign in was cancelled."

## Errors

Answer errors with a status code and JSON `{ "message": "..." }`. Extra fields are ignored. The app shows `message` as is. When it is missing, the app shows "The server answered <status>."

| Status | Meaning                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| 400    | Bad input: invalid change, too many changes, bad cursor or limit, bad signup, bad OAuth start.         |
| 401    | Missing, wrong or expired token, or a wrong password. On a token the app signs the user out.           |
| 403    | The route is off, for example signup.                                                                  |
| 404    | Unknown club flight or provider. Also what the app takes for "not a v1 server" on the required routes. |
| 413    | The body is too large.                                                                                 |
| 429    | Rate limited.                                                                                          |

## Testing your server

`src/lib/sync/spec.conformance.test.ts` checks a running server with plain `fetch`, so it works with any implementation. It is skipped unless `SPEC_URL` is set:

```sh
SPEC_URL=http://127.0.0.1:8090 SPEC_APP_ORIGIN=http://localhost:5173 npm test -- spec.conformance
```

- `SPEC_URL` is the server address without the base path.
- `SPEC_APP_ORIGIN` is optional. Set it to an origin your server allows, to also check the answer for an unknown OAuth provider.
- The server needs signup on (`auth.signup: true`), because the test creates its own accounts.
- The test waits and retries on 429, so rate limits are fine.

## Reference implementation

The PocketBase kit in `server/`, run it as described in [self-hosting-sync.md](../../../self-hosting-sync.md).

| File                                   | What it does                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `server/pb_hooks/updraft-v1.pb.js`     | All routes of the spec.                                                                            |
| `server/pb_hooks/updraft.js`           | Shared code: change validation, last write wins in one transaction, session, OAuth helpers.        |
| `server/pb_migrations/*.js`            | The `records` collection, club fields, sequence number and indexes, rate limits.                   |
| `server/compose.yaml`, `server/Dockerfile` | Runs PocketBase with the hooks and migrations mounted.                                          |

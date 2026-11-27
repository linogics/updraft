# Self-hosting sync

updraft stays local-first. Sync is optional and mirrors your flights, manual entries, camera paths and settings to a server you run yourself. The app speaks the [sync spec v2](server/README.md), and the PocketBase kit below implements it. To run a server of your own in another language, see the [sync server guide](server/README.md). The reference server runs on [PocketBase](https://pocketbase.io), one small binary with SQLite inside. The `server/` folder in this repository is everything it needs.

Users connect from the Sync section of the logbook, see [Point the app at the server](#point-the-app-at-the-server).

## Set up

1. Start the server: `docker compose -f server/compose.yaml up -d --build`. The image downloads the pinned PocketBase release and checks its sha256. The data lives in the `pb_data` volume.
2. Create the admin: `docker compose -f server/compose.yaml exec pocketbase pocketbase superuser upsert you@example.com 'a-long-password' --dir=/pb/pb_data`.
3. Open `http://localhost:8090/_/`, sign in and add the pilots in the `users` collection (email and password). Public signup is off. To allow it, start the server with `UPDRAFT_SIGNUP=true`, see [Environment variables](#environment-variables). Leave the create rule of `users` closed, signup goes through the hook.

The first start applies `server/pb_migrations`. It creates the collections `items`, `tracks`, `clubs` and the rest. All of them are closed, only the superuser dashboard can read or change them. The hooks `server/pb_hooks/updraft.js` and `server/pb_hooks/updraft-v2.pb.js` serve the whole sync spec under `/api/updraft/v2`. Every write checks the item version and takes the next number of one server counter in one transaction.

`server/pb_hooks` is required. Docker mounts it. Without Docker, download PocketBase v0.40.6, then run `./pocketbase serve --migrationsDir server/pb_migrations --hooksDir server/pb_hooks --automigrate=false`. If a hoster manages the server, upload both folders. When the hooks are missing, the app reports that the sync server kit is outdated. Automigrate is off so settings changed in the dashboard do not write new migration files into the repo.

## Environment variables

| Variable              | Effect                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `UPDRAFT_SIGNUP`      | `true` lets anyone create an account through `POST /api/updraft/v2/auth/signup` or an OAuth sign in. Off by default. |
| `UPDRAFT_APP_ORIGINS` | Exact origins of the app, comma separated. Needed for OAuth sign in.                                      |
| `UPDRAFT_PUBLIC_URL`  | The public https address of the server. Needed for OAuth sign in. Without both, no provider is offered.   |

With compose, put them in the shell or in a `.env` file next to `server/compose.yaml`, then restart:

```sh
UPDRAFT_SIGNUP=true docker compose -f server/compose.yaml up -d
```

Without Docker, export them before `./pocketbase serve`.

## HTTPS and CORS

Run a reverse proxy such as Caddy or nginx on the same host in front of port 8090 and serve it over HTTPS. The compose file only publishes port 8090 on localhost. A page served over HTTPS cannot call a plain HTTP server. With Caddy: `sync.example.com { reverse_proxy localhost:8090 }`. Sign in, signup and OAuth requests are limited to 2 per 3 seconds per client, read from the last `X-Forwarded-For` entry, and answer 429 with `Retry-After`. Caddy sets it by default, with nginx add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

PocketBase allows every origin by default and the hooks expose the `ETag` and `Retry-After` headers to the app. To only allow the app, add `--origins=https://your-app.example` to the `serve` command.

## Sign in with Google, GitHub and others

Open the `users` collection settings in the dashboard, go to Options, enable OAuth2 and add a provider. Set these environment variables on the server:

- `UPDRAFT_PUBLIC_URL`: the address of the server, for example `https://sync.example.com`.
- `UPDRAFT_APP_ORIGINS`: the exact origins of the app, comma separated, for example `https://updraft.example.org`. The sign in result is only sent to these.

In the provider's console use `<UPDRAFT_PUBLIC_URL>/api/updraft/v2/auth/callback` as the redirect URL. The app lists the enabled providers next to the password form. The sign in opens a popup, so it must be started by a click, and the app needs the page `/oauth-callback.html` that ships with it.

The provider is linked to the account whose email matches the provider's primary email. With `UPDRAFT_SIGNUP` unset an OAuth sign in only works for an existing account, so create it with exactly that email. Set `UPDRAFT_SIGNUP=true` to let people create accounts by signing in. It also lets the app offer **Create account** next to the password form.

## Clubs

A pilot can share single flights with a club. Members see the summary of a shared flight (pilot, date, site, glider, duration, distance, altitude, thermals, XC score) and its track, read only. Nothing else leaves the logbook.

The app never creates clubs. You do, in the dashboard:

1. Open `http://localhost:8090/_/` and the `clubs` collection. Add a record with the club name.
2. Open `club_members`. Add one record per pilot with the club and the pilot (a record of `users`).

The pilots see the club in the app after the next sync. Removing the `club_members` record takes the pilot out of the club, and the flights of that pilot show as deleted in the feed of the others. Adding a pilot shows the flights they already shared with the club. A club needs no other setup. Without the `clubs` collection the server announces `clubs: false`.

A pilot shares a flight by listing the club in `data.clubs` of the flight, the server keeps the summary (`data.club`) in `club_entries` so a club feed never loads the heavy flight data. Unknown clubs, clubs the pilot does not belong to and flights that are not shared all answer the same 404.

PocketBase's own records API is closed for all of these collections. The routes run as superuser and check ownership and membership in code.

## Limits and conflicts

The server announces `maxPage` 200, `maxItemBytes` 1 MB and `maxTrackBytes` 20 MB. A track is stored as a file next to the database, so it counts against the disk and the backup size. The server never merges. On a conflict it answers 412 with the current item and the app merges field by field.

## Backups

Everything is in `pb_data`. Stop the server and copy the folder, or use Settings, Backups in the dashboard. Restoring means putting the folder back.

## Point the app at the server

Users enter the address in the Sync section of the logbook. Use `https`. Plain `http` is only accepted for `localhost` and `127.0.0.1`.

To fill it in for everyone who opens your hosted app, serve a `config.json` at the root of the site:

```json
{ "sync": { "url": "https://sync.example.com" } }
```

When you build the app yourself, put the file at `static/config.json` before `npm run build`. Otherwise add it next to `index.html` on the web server. The app reads it on every start and the service worker never caches it, so edits apply on the next load. A missing or invalid file means no preset. An address a user typed in always wins over the file. The sync server must allow the origin of your app, see the CORS section above.

## Development

The [contract suite](server/README.md#testing-your-server) runs against a real server. Start it, create a superuser, then let the seed script sign up two pilots and put them in one club:

```sh
mkdir /tmp/pb && UPDRAFT_SIGNUP=true ./pocketbase serve --dir /tmp/pb --migrationsDir server/pb_migrations --hooksDir server/pb_hooks --http=127.0.0.1:8090 --automigrate=false &
./pocketbase superuser upsert admin@example.org a-long-password --dir /tmp/pb --migrationsDir server/pb_migrations
eval "$(node scripts/seed-contract.mjs --url http://127.0.0.1:8090 --admin admin@example.org --password a-long-password)"
npm run contract -- --url http://127.0.0.1:8090 --token "$T1" --token2 "$T2" --club "$CLUB"
```

Pass `--migrationsDir server/pb_migrations` to every command that opens the data folder. CI does the same against the Docker image.

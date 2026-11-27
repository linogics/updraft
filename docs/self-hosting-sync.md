# Self-hosting sync

updraft stays local-first. Sync is optional and mirrors your flights, manual entries, camera paths and settings to a server you run yourself. The bundled backend `updraft/http` speaks the [sync HTTP spec](plugins/backend/server/openapi.yaml). The reference server runs on [PocketBase](https://pocketbase.io), one small binary with SQLite inside. The `server/` folder in this repository is everything it needs.

Users connect from the Sync section of the logbook, see [Point the app at the server](#point-the-app-at-the-server).

## Set up

1. Start the server: `docker compose -f server/compose.yaml up -d --build`. The image downloads the pinned PocketBase release and checks its sha256. The data lives in the `pb_data` volume.
2. Create the admin: `docker compose -f server/compose.yaml exec pocketbase pocketbase superuser upsert you@example.com 'a-long-password' --dir=/pb/pb_data`.
3. Open `http://localhost:8090/_/`, sign in and add the pilots in the `users` collection (email and password). Public signup is off. To allow it, set the create rule of `users` to an empty string in the collection settings.

The first start applies `server/pb_migrations`. It creates the `records` collection. Each pilot can only read their own rows. Writes are refused on the collection itself and go through the hook `server/pb_hooks/updraft.pb.js`, which serves `POST /api/updraft/push`. It checks the last write wins rule and numbers every change in one transaction.

`server/pb_hooks` is required. Docker mounts it. Without Docker, download PocketBase v0.40.6, then run `./pocketbase serve --migrationsDir server/pb_migrations --hooksDir server/pb_hooks --automigrate=false`. If a hoster manages the server, upload both folders. When the hook is missing, the app reports that the sync server kit is outdated. Automigrate is off so settings changed in the dashboard do not write new migration files into the repo.

## HTTPS and CORS

Run a reverse proxy such as Caddy or nginx on the same host in front of port 8090 and serve it over HTTPS. The compose file only publishes port 8090 on localhost. A page served over HTTPS cannot call a plain HTTP server. With Caddy: `sync.example.com { reverse_proxy localhost:8090 }`. Login attempts are rate limited per client, read from the last `X-Forwarded-For` entry. Caddy sets it by default, with nginx add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

PocketBase allows every origin by default. To only allow the app, add `--origins=https://your-app.example` to the `serve` command.

## Sign in with Google, GitHub and others

Open the `users` collection settings in the dashboard, go to Options, enable OAuth2 and add a provider. Set these environment variables on the server:

- `UPDRAFT_PUBLIC_URL`: the address of the server, for example `https://sync.example.com`.
- `UPDRAFT_APP_ORIGINS`: the exact origins of the app, comma separated, for example `https://updraft.example.org`. The sign in result is only sent to these.

In the provider's console use `<UPDRAFT_PUBLIC_URL>/api/updraft/v1/auth/callback` as the redirect URL. The app lists the enabled providers next to the password form. The sign in opens a popup, so it must be started by a click, and the app needs the page `/oauth-callback.html` that ships with it.

The provider is linked to the account whose email matches the provider's primary email. With `UPDRAFT_SIGNUP` unset an OAuth sign in only works for an existing account, so create it with exactly that email. Set `UPDRAFT_SIGNUP=true` to let people create accounts by signing in. It also lets the app offer **Create account** next to the password form.

## Club sharing

Every account on the server is a club member. A pilot can share single flights with the club. A shared flight shows its summary (pilot, date, site, glider, duration, distance, altitude, thermals, XC score) and its full track to all signed in accounts, read only. Nothing else leaves the pilot's logbook.

This is done by the migration `1795700000_updraft_club.js`, which adds the `shared` and `summary` fields to `records`. The list and view rule is `@request.auth.id != "" && (owner = @request.auth.id || shared = true)`. Updates go through the push hook, so a pilot can only change their own records. Delete stays owner only. Apply the migration by restarting the server. If you do not want a club, do not give accounts to people outside it.

## Known limits

Conflicts are last write wins per whole record, decided by the `updatedAt` of the device clock. A device with a clock running ahead wins until the others catch up. The losing edit is replaced without notice.

## Backups

Everything is in `pb_data`. Stop the server and copy the folder, or use Settings, Backups in the dashboard. Restoring means putting the folder back.

## Point the app at the server

Users enter the address in the Sync section of the logbook. Use `https`. Plain `http` is only accepted for `localhost` and `127.0.0.1`.

To fill it in for everyone who opens your hosted app, serve a `config.json` at the root of the site:

```json
{ "sync": { "backend": "updraft/http", "url": "https://sync.example.com" } }
```

When you build the app yourself, put the file at `static/config.json` before `npm run build`. Otherwise add it next to `index.html` on the web server. The app reads it on every start and the service worker never caches it, so edits apply on the next load. A missing or invalid file means no preset. An address a user typed in always wins over the file. The sync server must allow the origin of your app, see the CORS section above.

## Development

The conformance test runs against a real server and is skipped without `SPEC_URL`:

```sh
UPDRAFT_SIGNUP=true UPDRAFT_APP_ORIGINS=http://localhost:5173 UPDRAFT_PUBLIC_URL=http://127.0.0.1:8090 \
  ./pocketbase serve --dir /tmp/pb --migrationsDir server/pb_migrations --hooksDir server/pb_hooks --http=127.0.0.1:8090 --automigrate=false
SPEC_URL=http://127.0.0.1:8090 SPEC_APP_ORIGIN=http://localhost:5173 npm test -- spec.conformance
```

Pass `--migrationsDir server/pb_migrations` to every command that opens the data folder.

# Configuration

All settings are environment variables. With Docker they go into `.env` next to `docker-compose.yml`; [.env.example](../.env.example) lists every option with its default. `.env` is ignored by git, so secrets are safe there.

After changing `.env`, apply it with `docker compose up -d` (a restart alone does not re-read the file).

Nothing is required: Siduri starts with the defaults.

## Container

| Variable | Default | Description |
|---|---|---|
| `TZ` | `UTC` | Time zone of the container (log timestamps, dates). |
| `SIDURI_PORT` | `8087` | Port on the host the app is published on (used by `docker-compose.yml`). |

## Accounts and sessions

| Variable | Default | Description |
|---|---|---|
| `ALLOW_REGISTRATION` | `false` | Let more people create an account. The very first account can always be created. All accounts share the same brewery. |
| `BASE_URL` | – | Public address of the app, e.g. `https://siduri.example.com`. If it starts with `https://`, session cookies are marked `Secure`. It is also the only web page origin the [MCP endpoint](mcp.md) accepts, and the address shown under [Add device → RAPT Brew](devices.md). |
| `COOKIE_SECURE` | auto | Force the `Secure` cookie flag on or off. |
| `SESSION_DAYS` | `30` | How long a login lasts. Using the app extends it. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy, so client IP addresses (used for rate limiting) are correct. |

## Encryption (optional)

| Variable | Default | Description |
|---|---|---|
| `ENCRYPTION_KEY` | – | Encrypts the database file (SQLCipher). At least 32 characters; generate one with `openssl rand -hex 32`. Set it before the first start: it can't be added to, removed from or changed for an existing database. |
| `ENCRYPTION_KEY_FILE` | – | Alternative to `ENCRYPTION_KEY`: path of a file that holds the key, e.g. a Docker secret (`/run/secrets/siduri_key`). |

With a key, keep a copy of it somewhere safe, away from the server: without it, the database and its [backups](backups.md) cannot be read.

## Smart devices

| Variable | Default | Description |
|---|---|---|

## Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |

## Set by the Docker image

Only change these when running [without Docker](installation.md#running-without-docker).

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `PORT` | `3000` | HTTP port inside the container. |
| `DATA_DIR` | `/data` | Folder for the database. |
| `DATABASE_PATH` | `<DATA_DIR>/app.db` | Database file. |
| `WEB_DIST` | bundled | Folder of the built web app. |
| `LIVE_HEARTBEAT_MS` | `25000` | Interval of keep-alive messages on the live-update stream. |

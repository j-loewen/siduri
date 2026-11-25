# Installation

Siduri runs as a single Docker container. All data lives in one SQLite file in a folder on the host.

## Requirements

- Docker with the Compose plugin (`docker compose`)
- For installing the app on phones, for the screen to stay on during brew day, and for RAPT pushing to your server: a domain with HTTPS (see [Reverse proxy and HTTPS](reverse-proxy.md)). On your home network, plain HTTP works for everything else.

## Install

1. **Get the code**

   ```sh
   git clone https://github.com/j-loewen/siduri.git siduri
   cd siduri
   ```

2. **Create the configuration**

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

3. **Adjust `.env`.** At least:
   - `TZ`: your time zone, e.g. `Europe/Berlin`
   - `SIDURI_PORT`: the port on the host (default `8087`)
   - `BASE_URL`: the public address, if Siduri runs behind a reverse proxy, e.g. `https://siduri.example.com`

   All options are listed in [Configuration](configuration.md).

4. **Start it**

   ```sh
   docker compose up -d --build
   ```

5. Open `http://<host>:8087` and **create your account. The first account sets up the brewery.**

6. Brewing with someone? Set `ALLOW_REGISTRATION=true` in `.env`, run `docker compose up -d`, and let them create their own login. Everyone shares the same brewery: recipes, batches, inventory and equipment. Only the preferences (theme, language, units) are per person. Set it back to `false` afterwards.

## Using the prebuilt image

Every [release](https://github.com/j-loewen/siduri/releases) is also published as a ready-made image for `linux/amd64` and `linux/arm64` (e.g. Raspberry Pi 4/5): `ghcr.io/j-loewen/siduri`. You then need neither the source code nor a build, only two files.

1. **Get the configuration** instead of cloning the code:

   ```sh
   mkdir siduri && cd siduri
   curl -fsSL -o .env https://raw.githubusercontent.com/j-loewen/siduri/main/.env.example
   chmod 600 .env
   ```

2. **Create `docker-compose.yml`** in the same folder:

   ```yaml
   services:
     siduri:
       image: ghcr.io/j-loewen/siduri:latest
       container_name: siduri
       restart: unless-stopped
       ports:
         - "${SIDURI_PORT:-8087}:3000"
       volumes:
         - /etc/localtime:/etc/localtime:ro
         - ./data:/data
       env_file:
         - .env
   ```

   (If you already cloned the repository, you can instead edit its `docker-compose.yml`: remove the `build: .` line and set `image: ghcr.io/j-loewen/siduri:latest`.)

3. Continue with step 3 above (settings), then start it with `docker compose up -d` (no `--build`).

### Image tags

| Tag | What you get |
|---|---|
| `latest` | The newest release. Recommended. |
| `1.0` | The newest `1.0.x` release: bug fixes, but no jump to `1.1`. |
| `1.0.0` | Exactly this release; never changes. |
| `dev` | The latest state of the `main` branch, built on every change. **For testing only**, see below. |
| `sha-<commit>` | One particular `dev` build. Only the 10 most recent are kept. |

> [!WARNING]
> **Don't run `dev` with data you care about.** Database changes are applied on start-up and only go forward: once a `dev` build has changed the database, a release (`latest`) may no longer be able to open it. Use `dev` for a separate test installation with its own `data` folder, never switch an installation from `dev` back to `latest`, and make a [backup](backups.md) before trying it.

## Where the data is

`docker-compose.yml` mounts `./data` (next to the compose file) into the container:

| Path | Contents |
|---|---|
| `data/app.db`, `app.db-wal`, `app.db-shm` | The database: recipes, batches, readings, inventory, library, equipment, accounts, pictures. |

Pictures (recipe and brewery logos) are stored in the database too, so the backup is one folder. See [Backing up and restoring](backups.md).

## Changing settings

Edit `.env`, then apply it with:

```sh
docker compose up -d
```

A plain `docker compose restart` does not re-read `.env`.

## Updating

```sh
git pull
docker compose up -d --build
```

With the [prebuilt image](#using-the-prebuilt-image):

```sh
docker compose pull
docker compose up -d
```

Database changes are applied automatically when the new version starts. Make a [backup](backups.md) first.

## Health check

The container reports its health to Docker (`docker ps` shows *healthy*). The same check is available at `GET /api/health` for external monitoring.

## Running without Docker

Requires Node.js 22 or later.

```sh
npm ci
npm run build
DATA_DIR=/var/lib/siduri PORT=3000 \
  node apps/server/dist/index.js
```

The server serves the web app itself (from `apps/server/dist/public`). The other settings are the same environment variables as in Docker, see [Configuration](configuration.md).

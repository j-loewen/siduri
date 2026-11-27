# Development

Siduri is developed with an AI coding assistant ([Claude Code](https://claude.com/claude-code)); commits written that way carry a `Co-Authored-By: Claude …` line. See [How Siduri is made](how-it-is-made.md). Hand-written contributions and reviews are just as welcome. [CLAUDE.md](../CLAUDE.md) lists the project's conventions; it is written for the assistant, but holds for everyone.

## Setup

Requires Node.js 22 or later; development works on Windows, macOS and Linux. No Python or C++ build tools are needed: the native modules ship prebuilt binaries, and `.npmrc` turns off dependency install scripts so npm doesn't try to compile `better-sqlite3` from source.

```sh
npm install
npm run dev        # API on :3000 (tsx watch) + web app on :5173 (Vite, proxies /api)
```

Open http://localhost:5173. In development, data is stored in `apps/server/data/`, and `.env` is not read.

## Commands

```sh
npm test                     # tests of every workspace (vitest)
npm run typecheck            # all workspaces
npm run build                # web -> apps/web/dist, server bundle -> apps/server/dist (includes the web build)
npm start -w @brew/server    # run the production bundle locally (needs npm run build first)
npm run seed:build           # regenerate the built-in library from the pinned open-brewing-data
```

On Windows, a running server keeps `apps/server/dist` locked: stop it before `npm run build`.

## Project layout

```
apps/server/          Fastify API, SQLite (Drizzle ORM); migrations in apps/server/drizzle
apps/web/             React + Mantine single-page app
packages/shared/      zod schemas and types shared by server and web: units, library, recipe document, …
packages/brewcalc/    brewing math: gravity, IBU, colour, volumes, water chemistry, brew-day steps
packages/formats/     BeerXML 1.0 and BeerJSON 3.0 import and export (BeerJSON schemas vendored)
packages/seed-data/   the built-in library (generated from open-brewing-data), Siduri's own miscs and water profiles
docker/               container entrypoint
docs/                 this documentation
```

The npm packages are named `@brew/*` (the app's working title); the name people see is `APP_NAME` in `packages/shared/src/app.ts`.

Key places on the server:

| Path | What |
|---|---|
| `apps/server/src/app.ts` | Builds the Fastify app: routes, security headers, hourly housekeeping |
| `apps/server/src/config.ts` | All environment variables |
| `apps/server/src/db/` | Schema and database opening (optional encryption) |
| `apps/server/src/routes/` | HTTP endpoints, one file per area |
| `apps/server/src/services/` | Business logic: recipes, batches, inventory, library, … |
| `apps/server/src/devices/` | Smart devices: lenient telemetry parsing, the RAPT data stream (key, device matching) |
| `apps/server/src/mcp/` | The MCP server for AI assistants: one file of tools per area |
| `apps/server/src/live/` | Live updates over Server-Sent Events |

And in the web app:

| Path | What |
|---|---|
| `apps/web/src/pages/` | One page per area; `BrewDayPage` is full screen, outside the layout |
| `apps/web/src/components/` | The recipe editor sections, pickers, popups, … |
| `apps/web/src/units.tsx` | `UnitInput` (every measured value) and formatting |
| `apps/web/src/locales/en.json` | All UI text |

## Rules worth knowing

- **Canonical units** everywhere outside the UI: kg, L, °C, SG, EBC, minutes, %, ppm. Convert only for display and input.
- **Recipes are documents** (`RecipeDoc`): ingredient lines are copies of library values, and batches copy the whole document. Schema changes must stay backwards compatible (new fields with defaults), because stored and imported documents are re-read.
- **Inventory changes only through transactions**, so every change is in the history and brew-day deductions can be undone.
- **All UI text goes through `t()`**, and every measured value in the UI uses `<UnitInput>`.

More in [CLAUDE.md](../CLAUDE.md).

## Database

SQLite through [Drizzle ORM](https://orm.drizzle.team/). The SQLite library is `better-sqlite3-multiple-ciphers`, installed under the name `better-sqlite3` (an npm alias in `apps/server/package.json`): the same library with optional encryption built in, under the name Drizzle's driver loads.

The schema is in `apps/server/src/db/schema.ts`. It starts with a single migration, `apps/server/drizzle/0000_init.sql`. After changing the schema, create a migration:

```sh
npm run db:generate -w @brew/server -- --name <what-changed>
```

Check the generated SQL. Migrations run automatically on start-up.

## Tests

- `packages/brewcalc` checks its results against published and hand-calculated reference values.
- `packages/formats` imports real BeerSmith exports and the official BeerJSON samples, covers Brewfather's way of writing BeerJSON, and round-trips recipes through both formats; BeerJSON exports are validated against the official schema.
- The server tests in `apps/server/test` run the real app against an in-memory database. `test/helpers.ts` has `makeApp()` and a `client()` that behaves like a browser (session cookie, CSRF header).
There are no tests for the web app; for UI changes, run the app and check it.

## Translations

The UI text is in `apps/web/src/locales/en.json`. To add a language:

1. Copy the file to `<code>.json` and translate the values.
2. Register it in `apps/web/src/i18n.ts` (`RESOURCES` and `LANGUAGE_NAMES`). It then shows up in **Settings**.

## Docker image

The [Dockerfile](../Dockerfile) builds in stages: install and build, then install only the native modules the bundle leaves out (`better-sqlite3`, `@node-rs/argon2`), then a small runtime image on `node:24-alpine`. The container starts as root only to make `/data` writable, then runs as the `node` user.

## CI and releases

GitHub Actions in [`.github/workflows`](../.github/workflows):

| Workflow | When | What |
|---|---|---|
| `ci.yml` | Pull requests | Checks, and a Docker build (not pushed) |
| `ci.yml` | Pushes to `main` | Checks, then publishes `ghcr.io/j-loewen/siduri:dev` and `:sha-<commit>`, then cleans up old dev images |
| `release.yml` | Version tags (`v*.*.*`) | Checks, then publishes `:<version>`, `:<major>.<minor>` and `:latest`, then creates the GitHub release with notes generated from the commits since the previous one |
| `cleanup-images.yml` | After each dev build, or by hand | Keeps the 10 newest `sha-*` images plus `dev`; deletes older ones and leftovers of failed builds. Never touches release images. Started by hand from the Actions tab, it is a dry run by default |

The reusable parts: `checks.yml` (typecheck, tests and build on Node 22 and 24) and `image.yml` (builds amd64 and arm64 natively on separate runners, then combines them into one image).

**One-time setup** after the first image is published, on the package page (repository sidebar → **Packages** → **siduri** → **Package settings**):

- **Change visibility** to **Public**, so the image can be pulled without signing in.
- Under **Manage Actions access**, give the `siduri` repository the **Admin** role. The cleanup job needs it to delete old images.

To release, add the version to [CHANGELOG.md](../CHANGELOG.md) (with what users have to do when updating), commit it to `main`, then tag `main` and push the tag:

```sh
git tag -a v1.1.0 -m "Siduri 1.1.0"
git push origin v1.1.0
```

The tag is the version; the `version` fields in the `package.json` files are not used. Tags with a suffix (`v1.1.0-beta.1`) become pre-releases and don't move the `latest` image tag. Edit the generated notes on GitHub afterwards if they need context.

# Siduri — notes for Claude

Self-hosted brewing app (recipes, batches, inventory, equipment, water), called **Siduri**. The
name people see comes from `APP_NAME` / `APP_ID` in `packages/shared/src/app.ts`;
technical names (`@brew/*` packages, `brew_sid` cookie, `x-brew-client` header) are the working
title "brew" and stay that way. The stack mirrors
[Magpie](https://github.com/j-loewen/magpie): Fastify 5 + Drizzle/SQLite server, React 19 + Mantine 9 + TanStack
Router/Query web app, zod schemas shared by both, one Docker image.

## Commands

```sh
npm install                       # .npmrc sets ignore-scripts; native modules use prebuilt binaries
npm run dev                       # API :3000 (tsx watch) + Vite :5173 (proxies /api)
npm test                          # vitest in every workspace (server: in-memory DB)
npm run typecheck                 # all workspaces; run before calling work done
npm run build                     # web + server bundle (apps/server/dist)
npm run db:generate -w @brew/server -- --name <what-changed>
npm run seed:build -- <path to a common-beer-data clone>   # regenerate the bundled library
```

Before finishing a change: `npm run typecheck` and `npm test` must both pass. There are no web
tests; for UI changes, run the app and check it.

## Layout

```
apps/server/src/     app.ts (wiring), config.ts (env), routes/ (HTTP, one file per area),
                     services/ (logic), db/ (schema, open), live/ (SSE hub), mcp/ (MCP tools for Claude)
apps/web/src/        pages/ (BrewDayPage is full screen, outside AppLayout), components/,
                     units.tsx (UnitInput + formatting), lib/alerts.ts (sound, wake lock), i18n.ts, locales/
packages/shared/     zod schemas + types: units, library, equipment, recipe document, settings
packages/brewcalc/   pure brewing math (gravity, IBU, color, volumes, brew-day steps, corrections)
packages/formats/    BeerXML 1.0 + BeerJSON 3.0 import/export (vendored BeerJSON schemas)
packages/seed-data/  bundled ingredient library (generated JSON + water profiles)
docs/                configuration, development, roadmap
```

## Rules that aren't obvious from the code

- **Canonical units everywhere outside the UI**: kg, L, °C, SG, EBC, minutes, %, ppm, bar, vols.
  Convert only for display/input (`apps/web/src/units.tsx`, `packages/shared/src/units.ts`).
  Every measured value in the UI uses `<UnitInput measure=…>` so the user can switch its unit.
- **All UI text goes through `t()`** with keys in `apps/web/src/locales/en.json`. Enum labels
  are `enums.<enumName>.<value>`; new enum values need a label. Server errors carry a `code`
  the client translates (`errors.<code>`).
- **One shared brewery**: all signed-in users see and edit the same data. There is no per-user
  ownership; only preferences (theme, language, units) are per user.
- **Recipes are documents** (`RecipeDoc` in `packages/shared/src/recipe.ts`), stored as JSON with
  calculated stats in columns. Ingredient lines are *snapshots* of library values (`libraryRef`
  points back); editing the library never changes recipes. Batches copy the doc.
  Schema changes to `RecipeDoc` must stay backwards compatible (add fields with defaults);
  `toRecipeDto` re-parses stored docs to fill new defaults.
- **Patch schemas must not have defaults**: zod 4 fills `.default()` values into missing keys even
  after `.partial()`, so a patch of one field would reset the others. Build patch schemas from the
  fields without defaults (see `users.ts`, `settings.ts`, `batchMeasuredPatchSchema`).
- **Defaults with nested arrays must be factories** (`.default(() => ({ steps: [] }))`): zod copies a
  default only one level deep, so a plain object default shares its inner arrays between documents.
- **Inventory** changes only through transactions (`inventory_tx`); brew-day deductions record the
  batch and can be undone. Recipe lines match stock by `libraryRef`, then by name, and water agents
  by `waterAgentOf()` keywords (`packages/shared/src/water.ts`; their seed keys are fixed).
- **Recipe and batch document saves use optimistic concurrency** (`version`); a stale save gets 409.
- **Batches** copy the recipe document (line ids are kept, so `diffRecipes` matches lines by id).
  Brew-day progress is changed only through actions (`POST /api/batches/:id/brewday`) applied with
  the **server clock**; clients correct for clock skew with `serverTime` (`clockOffset` in the web
  app). Brew-day steps come from `brewDaySteps()` in brewcalc; their ids and checklist keys are
  derived from line ids and must stay stable, because stored progress refers to them.
- Batch log events are stored as codes (`created`, `brewdayStarted`, `status:<status>`) and
  translated in the UI (`batches.log.*`).
- **Pictures** are stored in the database (`images`, so a backup stays one file). The browser
  shrinks them before upload (`lib/image.ts`; SVG is drawn there and uploaded as WebP: never let
  the server store SVG, it can carry scripts); the server checks the type by its first bytes and
  deletes pictures no recipe or batch document refers to after a day (hourly housekeeping).
- **Seed library**: items carry a `seedKey`; `seed_keys` remembers every key ever added so deleted
  seed items don't come back. Bump `SEED_VERSION` when changing the seed data.
- **CSRF**: mutating requests need the `x-brew-client` header (`CSRF_HEADER` in shared). Paths under
  `/api/integrations/` are exempt (device pushes) and authenticate by the device token in the URL,
  or (`devices/stream.ts`) by a stream key: in the `Authorization` header for the RAPT data stream,
  in the path for Tilt cloud logging (the Tilt apps can only take a URL).
  Never put user-facing routes there (the stream settings live under `/api/rapt/stream`).
- **Devices**: telemetry is read leniently by `devices/telemetry.ts` (field names, SG/°P/SG×1000,
  °C/°F); the last messages are stored on the device for checking. RAPT offers no API for other
  apps, only its Brew Data Stream, so nothing polls the RAPT cloud and target temperatures are set
  in the RAPT app, not here.
- **MCP server** (`POST /mcp`, `apps/server/src/mcp/`, docs in `docs/mcp.md`): tools are thin wrappers
  over the services, one file per area in `mcp/tools/`, each with a `level` (`read` < `write` < `full`)
  that decides which access tokens get it. Writes must `changed()` the same live areas as the REST
  route. `/mcp` authenticates only by access token (`api_tokens`, managed in Settings), never by the
  session cookie. Never expose users, settings, device accounts or tokens (including device push
  tokens) as tools; `set_default_equipment` is the one narrow settings write, as in the REST route.
- **Schema changes need a migration** (`db:generate`). Check the generated SQL.
- **`better-sqlite3` is an alias** for `better-sqlite3-multiple-ciphers` (prebuilt binaries,
  optional encryption). Don't "fix" it. Don't add dependencies that need install scripts.
- **New env vars** go in `config.ts`, `.env.example` and `docs/configuration.md`.
- **TypeScript is strict** with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
- **Line endings are LF**. Development happens on Windows: a running server locks
  `apps/server/dist`, so stop it before `npm run build`.
- **Heredocs**: in this environment, multi-line shell heredocs containing quotes sometimes fail;
  write files with the Write tool instead.

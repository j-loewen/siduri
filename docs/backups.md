# Backing up and restoring

Everything is in the `./data` folder on the host (one SQLite database, pictures included), so a full backup is a copy of that folder, made with whatever tool you already use. For a copy of the brewery's data without touching the server, or to move it to another server, use [backup files](#backup-files-from-the-settings).

## Backup files from the settings

**Settings → Backup** downloads the brewery's data as one JSON file. Choose what goes in:

| Section | What it holds |
|---|---|
| Recipes | All recipes, with their pictures |
| Batches | All batches with readings, notes and the log |
| Inventory | Stock and its history |
| Equipment | Equipment profiles, fermenters and kegs (not smart devices) |
| Water profiles | Your own water profiles, not the built-in ones |
| Library | Ingredients and styles you added, not the built-in ones |
| Settings | Brewery name, logo and defaults, and your own preferences (theme, language, units) |

Passwords, user accounts, access tokens and smart devices (with their push URLs) are never in the file. Everything else is not encrypted, even with an `ENCRYPTION_KEY`, so keep the file somewhere safe.

**Import a backup** (same place) reads such a file and lets you choose which of its sections to add. Items keep their identity, so links between them still work (a batch and its recipe, a batch and its fermenter, recipe lines and the library). Items already on the server are skipped: the same item, or a library item, water profile, equipment profile or vessel with the same name. Importing the same file twice therefore adds nothing. Built-in library items aren't in the file; references to them are linked to the built-in items of the server, also in files made before the built-in library came from open-brewing-data. A batch whose number is taken gets the next free number. Imported settings replace the current brewery settings and your preferences.

A backup file is not a full copy of the server: users, devices, stored device readings and the [trash](user-guide.md#trash) are missing. To restore a whole server, copy the `data` folder as described below.

## Make a backup

Stop the app while copying, so the database is not written to halfway through:

```sh
cd /path/to/siduri
docker compose stop
cp -a data /path/to/backups/siduri-$(date +%F)
docker compose start
```

Without stopping the app, SQLite can make a consistent copy itself:

```sh
sqlite3 data/app.db ".backup /path/to/backups/siduri-$(date +%F).db"
```

If you set an [`ENCRYPTION_KEY`](configuration.md#encryption-optional), the copy is encrypted too. **Keep the key separately**: a backup is useless without it.

### Automating it

A nightly cron job on the host, for example:

```sh
# crontab -e
30 3 * * * cd /path/to/siduri && docker compose stop -t 30 && rsync -a --delete data/ /mnt/backup/siduri/ ; docker compose start
```

Tools like restic, Borg or rsnapshot work the same way: stop, copy `data/`, start. Versioned backups (several days back) protect you from deleting something by mistake and only noticing later.

Don't back up in the middle of a brew day: the app is stopped for a moment, and the brew-day screen waits until it is back.

## Restore

1. Stop the app: `docker compose down`
2. Replace the `data` folder with the backup copy (the whole folder, including `app.db-wal` if present).
3. With encryption: make sure `.env` has the **same `ENCRYPTION_KEY`** as when the backup was made.
4. Start the app: `docker compose up -d`

## Recipes as files

Every recipe can be downloaded as BeerXML or BeerJSON (**⋯ → Export** in the recipe). These files are not a backup of the brewery (batches, readings, inventory and settings are not in them), but other brewing software can open them. See [Import and export](user-guide.md#import-and-export).

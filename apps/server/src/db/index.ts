import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// "better-sqlite3" is installed as an alias of better-sqlite3-multiple-ciphers (see package.json):
// the same library with encryption built in, under the name drizzle's driver loads.
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const here = path.dirname(fileURLToPath(import.meta.url));

/** Migrations sit next to the bundle (dist/drizzle) or at the package root in dev (src/db -> ../../drizzle). */
function migrationsFolder(): string {
  const candidates = [path.join(here, 'drizzle'), path.resolve(here, '../../drizzle')];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'meta', '_journal.json')));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

/**
 * Opens (or creates) the database. With a key, the whole file and its WAL are encrypted in the
 * SQLCipher 4 format, so tools such as "DB Browser for SQLite" (SQLCipher mode) can open it with
 * the same key; without the key the file is unreadable.
 */
export function openDb(databasePath: string, key?: string): Db {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  // An in-memory database (tests) has nothing on disk to protect, and cannot take a key.
  if (key && databasePath !== ':memory:') {
    // Must come before anything else reads the file.
    sqlite.pragma(`cipher = 'sqlcipher'`);
    sqlite.pragma('legacy = 4');
    sqlite.pragma(`key = '${key.replaceAll("'", "''")}'`);
  }
  try {
    sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (err) {
    sqlite.close();
    if ((err as { code?: string }).code === 'SQLITE_NOTADB') {
      throw new Error(
        key
          ? 'Cannot open the database: ENCRYPTION_KEY is wrong, or the database was created without one.'
          : 'Cannot open the database: it is encrypted. Set ENCRYPTION_KEY.',
      );
    }
    throw err;
  }
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

export { schema };

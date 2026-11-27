import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  INVENTORY_KINDS,
  parseLibraryData,
  type InventoryKind,
  type LibraryValuesDto,
  type LibraryDataMap,
  type LibraryItemDto,
  type LibraryKind,
  type LibraryListQuery,
  type LibrarySource,
} from '@brew/shared';
import {
  LEGACY_SEED_FIELDS,
  LEGACY_SEED_KEYS,
  RENAMED_SEED_KEYS,
  SEED_ITEMS,
  seedDataHash,
  seedItem,
  stableStringify,
  substitutesOf,
} from '@brew/seed-data';
import type { Db } from '../db';
import { inventoryItems, libraryItems, seedKeys, type LibraryRow } from '../db/schema';
import { badRequest, HttpError, notFound } from '../lib/errors';
import { keepInTrash } from './trash';

/** Built-in items follow the bundled data and can't be edited. */
export const isBuiltIn = (row: Pick<LibraryRow, 'seedKey'>) => row.seedKey != null && seedItem(row.seedKey) != null;

export function toLibraryDto(row: LibraryRow): LibraryItemDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    source: row.source,
    seedKey: row.seedKey,
    readOnly: isBuiltIn(row),
    data: row.data as unknown as LibraryDataMap[LibraryKind],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Escape LIKE wildcards in user input. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listLibrary(db: Db, query: LibraryListQuery): LibraryItemDto[] {
  const term = query.q ? likeTerm(query.q) : '';
  const where = query.q
    ? and(
        eq(libraryItems.kind, query.kind),
        sql`(${libraryItems.name} like ${term} escape '\\'
          or json_extract(${libraryItems.data}, '$.producer') like ${term} escape '\\'
          or exists (select 1 from json_each(${libraryItems.data}, '$.aliases') where value like ${term} escape '\\'))`,
      )
    : eq(libraryItems.kind, query.kind);
  return db
    .select()
    .from(libraryItems)
    .where(where)
    .orderBy(asc(sql`lower(${libraryItems.name})`))
    .limit(query.limit)
    .all()
    .map(toLibraryDto);
}

export function getLibraryItem(db: Db, id: string): LibraryItemDto {
  const row = db.select().from(libraryItems).where(eq(libraryItems.id, id)).get();
  if (!row) throw notFound('Library item not found');
  return toLibraryDto(row);
}

function validData(kind: LibraryKind, data: unknown) {
  try {
    return parseLibraryData(kind, data);
  } catch (err) {
    throw badRequest('Invalid library data', (err as { issues?: unknown }).issues);
  }
}

export function createLibraryItem(db: Db, kind: LibraryKind, data: unknown, source: LibrarySource = 'user'): LibraryItemDto {
  const parsed = validData(kind, data);
  const row = db
    .insert(libraryItems)
    .values({ id: crypto.randomUUID(), kind, name: parsed.name, source, data: parsed as unknown as Record<string, unknown> })
    .returning()
    .get();
  return toLibraryDto(row);
}

const readOnlyError = () =>
  new HttpError(403, 'library_read_only', 'Built-in library items can’t be changed or deleted. Copy the item to use your own values.');

export function updateLibraryItem(db: Db, id: string, data: unknown): LibraryItemDto {
  const existing = getLibraryItem(db, id);
  if (existing.readOnly) throw readOnlyError();
  const parsed = validData(existing.kind, data);
  const row = db
    .update(libraryItems)
    .set({ name: parsed.name, data: parsed as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(libraryItems.id, id))
    .returning()
    .get();
  return toLibraryDto(row);
}

/** Moves it to the trash; recipes keep their copy of its values. Built-in items can't be deleted. */
export function deleteLibraryItem(db: Db, id: string) {
  if (getLibraryItem(db, id).readOnly) throw readOnlyError();
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    keepInTrash(t, 'library', id);
    if (t.delete(libraryItems).where(eq(libraryItems.id, id)).run().changes === 0) throw notFound('Library item not found');
  });
}

/** Producers of a kind and all countries of origin in the library (and stock), for the suggestion lists. */
export function libraryValues(db: Db, kind: LibraryKind): LibraryValuesDto {
  const distinct = (rows: { v: unknown }[]) =>
    [...new Map(rows.map((r) => (typeof r.v === 'string' ? r.v.trim() : '')).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );
  const producerOf = sql`json_extract(${libraryItems.data}, '$.producer')`;
  const originOf = sql`json_extract(${libraryItems.data}, '$.origin')`;
  const producers = [
    ...db.select({ v: producerOf }).from(libraryItems).where(eq(libraryItems.kind, kind)).all(),
    ...(INVENTORY_KINDS.includes(kind as InventoryKind)
      ? db.select({ v: inventoryItems.producer }).from(inventoryItems).where(eq(inventoryItems.kind, kind as InventoryKind)).all()
      : []),
  ];
  const origins = db.select({ v: originOf }).from(libraryItems).where(sql`${originOf} is not null and ${originOf} != ''`).all();
  return { producers: distinct(producers), origins: distinct(origins) };
}

/** Built-in items that can replace this one: other producers' versions of the same malt, hop substitutes. */
export function librarySubstitutes(db: Db, id: string): LibraryItemDto[] {
  const item = getLibraryItem(db, id);
  const keys = item.seedKey ? substitutesOf(item.seedKey) : [];
  if (!keys.length) return [];
  return db
    .select()
    .from(libraryItems)
    .where(inArray(libraryItems.seedKey, keys))
    .orderBy(asc(sql`lower(${libraryItems.name})`))
    .all()
    .map(toLibraryDto);
}

/** Marks (in `seed_keys`) that built-in items the user had edited were turned into own items. */
const READ_ONLY_MIGRATION = 'migration:read-only-library';

/** Stored data, read with today's schema (fills fields added since); null when it no longer parses. */
function storedData(row: Pick<LibraryRow, 'kind' | 'data'>): Record<string, unknown> | null {
  try {
    return parseLibraryData(row.kind, row.data) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

const sameData = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

export interface LibrarySyncResult {
  added: number;
  updated: number;
  /** Built-in items moved to a new key (the library before open-brewing-data, renamed ids). */
  renamed: number;
  /** Built-in items that became the user's own: edited before, or no longer in the bundled data. */
  detached: number;
}

/**
 * Brings the built-in items in line with the bundled data. Runs on every start:
 * - once, items of the old library get their new keys; ones the user had edited stay as the
 *   user's own items (and a fresh built-in item is added next to them);
 * - ids open-brewing-data renamed are followed;
 * - built-in items get the bundled values; new ones are added, except those the user deleted;
 * - items no longer bundled become the user's own.
 */
export function syncLibrary(db: Db): LibrarySyncResult {
  const result: LibrarySyncResult = { added: 0, updated: 0, renamed: 0, detached: 0 };
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const known = new Set(t.select({ key: seedKeys.seedKey }).from(seedKeys).all().map((r) => r.key));
    const remember = (key: string) => {
      if (known.has(key)) return;
      t.insert(seedKeys).values({ seedKey: key }).onConflictDoNothing().run();
      known.add(key);
    };
    const forget = (key: string) => {
      t.delete(seedKeys).where(eq(seedKeys.seedKey, key)).run();
      known.delete(key);
    };
    const builtIns = () => t.select().from(libraryItems).where(isNotNull(libraryItems.seedKey)).all();
    const setKey = (id: string, seedKey: string) => t.update(libraryItems).set({ seedKey }).where(eq(libraryItems.id, id)).run();
    const detach = (id: string) => {
      t.update(libraryItems).set({ seedKey: null, source: 'user' }).where(eq(libraryItems.id, id)).run();
      result.detached++;
    };

    if (!known.has(READ_ONLY_MIGRATION)) {
      const legacySeen = new Set<string>();
      for (const row of builtIns()) {
        const key = row.seedKey!;
        const legacy = LEGACY_SEED_KEYS[key];
        if (legacy) legacySeen.add(key);
        const bundled = seedItem(legacy?.key ?? key);
        if (!bundled) continue; // detached below
        const data = storedData(row);
        const untouched =
          row.updatedAt.getTime() === row.createdAt.getTime() ||
          (data != null && (legacy ? seedDataHash(data, LEGACY_SEED_FIELDS[row.kind]) === legacy.hash : sameData(data, bundled.data)));
        if (!untouched) {
          detach(row.id);
          // The bundled item comes back as a fresh built-in.
          forget(bundled.seedKey);
        } else if (legacy) {
          setKey(row.id, legacy.key);
          result.renamed++;
        }
      }
      // Old items the user deleted stay deleted under their new key.
      for (const [old, { key }] of Object.entries(LEGACY_SEED_KEYS)) if (known.has(old) && !legacySeen.has(old)) remember(key);
      remember(READ_ONLY_MIGRATION);
    }

    for (const row of builtIns()) {
      const next = RENAMED_SEED_KEYS[row.seedKey!];
      if (!next || next === row.seedKey) continue;
      if (t.select({ id: libraryItems.id }).from(libraryItems).where(eq(libraryItems.seedKey, next)).get()) detach(row.id);
      else {
        setKey(row.id, next);
        result.renamed++;
      }
    }
    for (const [old, next] of Object.entries(RENAMED_SEED_KEYS)) if (known.has(old)) remember(next);

    const rows = new Map(builtIns().map((r) => [r.seedKey!, r]));
    for (const item of SEED_ITEMS) {
      const row = rows.get(item.seedKey);
      if (row) {
        rows.delete(item.seedKey);
        if (sameData(row.data, item.data) && row.name === item.data.name) continue;
        t.update(libraryItems)
          .set({ name: item.data.name, data: item.data as unknown as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(libraryItems.id, row.id))
          .run();
        result.updated++;
      } else if (!known.has(item.seedKey)) {
        t.insert(libraryItems)
          .values({
            id: crypto.randomUUID(),
            kind: item.kind,
            name: item.data.name,
            source: 'seed',
            seedKey: item.seedKey,
            data: item.data as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .run();
        remember(item.seedKey);
        result.added++;
      }
    }
    // Left over: no longer in the bundled data.
    for (const row of rows.values()) detach(row.id);
  });
  return result;
}

/** Names (lower case) already in the library for a kind, to skip duplicates on import. */
export function existingNames(db: Db, kind: LibraryKind, names: string[]): Set<string> {
  if (!names.length) return new Set();
  const lower = [...new Set(names.map((n) => n.toLowerCase()))];
  const rows: { name: string }[] = [];
  // SQLite limits bound parameters; check in chunks.
  for (let i = 0; i < lower.length; i += 500) {
    rows.push(
      ...db
        .select({ name: libraryItems.name })
        .from(libraryItems)
        .where(and(eq(libraryItems.kind, kind), inArray(sql`lower(${libraryItems.name})`, lower.slice(i, i + 500))))
        .all(),
    );
  }
  return new Set(rows.map((r) => r.name.toLowerCase()));
}


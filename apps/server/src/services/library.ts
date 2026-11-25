import { and, asc, eq, inArray, sql } from 'drizzle-orm';
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
import { SEED_ITEMS, seedItem } from '@brew/seed-data';
import type { Db } from '../db';
import { inventoryItems, libraryItems, seedKeys, type LibraryRow } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

export function toLibraryDto(row: LibraryRow): LibraryItemDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    source: row.source,
    seedKey: row.seedKey,
    data: row.data as unknown as LibraryDataMap[LibraryKind],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Escape LIKE wildcards in user input. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listLibrary(db: Db, query: LibraryListQuery): LibraryItemDto[] {
  const where = query.q
    ? and(
        eq(libraryItems.kind, query.kind),
        sql`(${libraryItems.name} like ${likeTerm(query.q)} escape '\\' or json_extract(${libraryItems.data}, '$.producer') like ${likeTerm(query.q)} escape '\\')`,
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

export function updateLibraryItem(db: Db, id: string, data: unknown): LibraryItemDto {
  const existing = getLibraryItem(db, id);
  const parsed = validData(existing.kind, data);
  const row = db
    .update(libraryItems)
    .set({ name: parsed.name, data: parsed as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(libraryItems.id, id))
    .returning()
    .get();
  return toLibraryDto(row);
}

export function deleteLibraryItem(db: Db, id: string) {
  const res = db.delete(libraryItems).where(eq(libraryItems.id, id)).run();
  if (res.changes === 0) throw notFound('Library item not found');
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

/** Put a seed item back to the bundled values. */
export function resetLibraryItem(db: Db, id: string): LibraryItemDto {
  const item = getLibraryItem(db, id);
  const seed = item.seedKey ? seedItem(item.seedKey) : undefined;
  if (!seed) throw badRequest('Only items from the built-in library can be reset');
  return updateLibraryItem(db, id, seed.data);
}

/**
 * Adds bundled library items that were never added before. Items the user edited or deleted are
 * left alone. Runs on every start; cheap when there is nothing new.
 */
export function seedLibrary(db: Db): number {
  const known = new Set(db.select({ key: seedKeys.seedKey }).from(seedKeys).all().map((r) => r.key));
  const missing = SEED_ITEMS.filter((i) => !known.has(i.seedKey));
  if (!missing.length) return 0;
  db.transaction((tx) => {
    for (const item of missing) {
      tx.insert(libraryItems)
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
      tx.insert(seedKeys).values({ seedKey: item.seedKey }).onConflictDoNothing().run();
    }
  });
  return missing.length;
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


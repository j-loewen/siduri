import { randomBytes } from 'node:crypto';
import { and, desc, eq, getTableColumns, inArray, is, isNull, lt, sql } from 'drizzle-orm';
import { SQLiteTimestamp, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { LiveArea, TrashItemDto, TrashKind, TrashListDto, TrashRestoreDto } from '@brew/shared';
import { currentSeedKey, seedItem } from '@brew/seed-data';
import type { Db } from '../db';
import {
  batches,
  batchLog,
  batchReadings,
  devices,
  equipmentProfiles,
  inventoryItems,
  inventoryTx,
  libraryItems,
  recipes,
  trash,
  vessels,
  type BatchRow,
  type DeviceRow,
  type InventoryRow,
  type LibraryRow,
  type RecipeRow,
  type VesselRow,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { getSettings, updateSettings } from './settings';

const DAY = 24 * 3600_000;

/**
 * What a trash entry holds: the record as JSON (dates as ISO strings), the rows deleted along with
 * it, and the ids of records whose link to it the database cleared (set null), so a restore can
 * link them again.
 */
interface Snapshot {
  row: Record<string, unknown>;
  readings?: Record<string, unknown>[];
  log?: Record<string, unknown>[];
  tx?: Record<string, unknown>[];
  /** Batches whose recipe or vessel it was. */
  batches?: string[];
  /** Devices linked to the batch or vessel. */
  devices?: string[];
  /** Inventory transactions of a batch (brew-day deductions). */
  txs?: string[];
}

const json = (row: object) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>;

/** Turns a stored row back into insert values (dates were stored as strings). */
function revive<T extends SQLiteTable>(table: T, data: Record<string, unknown>): T['$inferInsert'] {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (!(key in data)) continue;
    const v = data[key];
    out[key] = is(col, SQLiteTimestamp) && typeof v === 'string' ? new Date(v) : v;
  }
  return out as T['$inferInsert'];
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const exists = (db: Db, table: typeof recipes | typeof batches | typeof vessels, id: string | null | undefined) =>
  Boolean(id && db.select({ id: table.id }).from(table).where(eq(table.id, id)).get());

/** Live areas to tell about a restore. */
const AREAS: Record<TrashKind, LiveArea[]> = {
  recipe: ['recipes', 'batches'],
  batch: ['batches', 'equipment', 'devices', 'inventory'],
  inventory: ['inventory'],
  library: ['library'],
  equipment: ['equipment', 'settings'],
  vessel: ['equipment', 'batches', 'devices'],
  device: ['devices'],
};
export const trashAreas = (kind: TrashKind) => AREAS[kind];

// ---- Putting things in -----------------------------------------------------------------------------

function snapshot(db: Db, kind: TrashKind, id: string): { name: string; detail: string; data: Snapshot } | null {
  switch (kind) {
    case 'recipe': {
      const row = db.select().from(recipes).where(eq(recipes.id, id)).get();
      if (!row) return null;
      const linked = ids(db.select({ id: batches.id }).from(batches).where(eq(batches.recipeId, id)).all());
      return { name: row.name, detail: row.styleName ?? '', data: { row: json(row), batches: linked } };
    }
    case 'batch': {
      const row = db.select().from(batches).where(eq(batches.id, id)).get();
      if (!row) return null;
      return {
        name: row.name,
        detail: `#${row.number}`,
        data: {
          row: json(row),
          readings: db.select().from(batchReadings).where(eq(batchReadings.batchId, id)).all().map(json),
          log: db.select().from(batchLog).where(eq(batchLog.batchId, id)).all().map(json),
          devices: ids(db.select({ id: devices.id }).from(devices).where(eq(devices.batchId, id)).all()),
          txs: ids(db.select({ id: inventoryTx.id }).from(inventoryTx).where(eq(inventoryTx.batchId, id)).all()),
        },
      };
    }
    case 'inventory': {
      const row = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
      if (!row) return null;
      return { name: row.name, detail: row.kind, data: { row: json(row), tx: db.select().from(inventoryTx).where(eq(inventoryTx.itemId, id)).all().map(json) } };
    }
    case 'library': {
      const row = db.select().from(libraryItems).where(eq(libraryItems.id, id)).get();
      return row ? { name: row.name, detail: row.kind, data: { row: json(row) } } : null;
    }
    case 'equipment': {
      const row = db.select().from(equipmentProfiles).where(eq(equipmentProfiles.id, id)).get();
      return row ? { name: row.name, detail: '', data: { row: json(row) } } : null;
    }
    case 'vessel': {
      const row = db.select().from(vessels).where(eq(vessels.id, id)).get();
      if (!row) return null;
      return {
        name: row.name,
        detail: row.kind,
        data: {
          row: json(row),
          batches: ids(db.select({ id: batches.id }).from(batches).where(eq(batches.vesselId, id)).all()),
          devices: ids(db.select({ id: devices.id }).from(devices).where(eq(devices.vesselId, id)).all()),
        },
      };
    }
    case 'device': {
      const row = db.select().from(devices).where(eq(devices.id, id)).get();
      return row ? { name: row.name, detail: row.type, data: { row: json(row) } } : null;
    }
  }
}

/**
 * Keeps a copy of a record in the trash; call it in the same transaction, just before deleting the
 * record. Does nothing when the record does not exist (the delete reports that) or the trash is off.
 */
export function keepInTrash(db: Db, kind: TrashKind, id: string) {
  if (getSettings(db).trashDays <= 0) return;
  const snap = snapshot(db, kind, id);
  if (!snap) return;
  db.insert(trash)
    .values({ id: crypto.randomUUID(), kind, itemId: id, name: snap.name, detail: snap.detail, data: snap.data as unknown as Record<string, unknown> })
    .run();
}

/** The highest batch number, counting batches in the trash (their numbers stay reserved). */
export function maxBatchNumber(db: Db): number {
  const live = db.select({ n: sql<number | null>`max(${batches.number})` }).from(batches).get()?.n ?? 0;
  const trashed =
    db
      .select({ n: sql<number | null>`max(cast(json_extract(${trash.data}, '$.row.number') as integer))` })
      .from(trash)
      .where(eq(trash.kind, 'batch'))
      .get()?.n ?? 0;
  return Math.max(live, trashed);
}

// ---- Listing and cleaning up -----------------------------------------------------------------------

/** Deletes for good what has been in the trash longer than the brewery's `trashDays`. */
export function purgeTrash(db: Db, now = Date.now()): number {
  const { trashDays } = getSettings(db);
  return db
    .delete(trash)
    .where(lt(trash.deletedAt, new Date(now - trashDays * DAY)))
    .run().changes;
}

export function listTrash(db: Db, kinds?: readonly TrashKind[]): TrashListDto {
  purgeTrash(db);
  const days = getSettings(db).trashDays;
  const rows = db
    .select({ id: trash.id, kind: trash.kind, itemId: trash.itemId, name: trash.name, detail: trash.detail, deletedAt: trash.deletedAt })
    .from(trash)
    .where(kinds ? inArray(trash.kind, [...kinds]) : undefined)
    .orderBy(desc(trash.deletedAt))
    .all();
  const items: TrashItemDto[] = rows.map((r) => ({
    ...r,
    deletedAt: r.deletedAt.toISOString(),
    purgeAt: new Date(r.deletedAt.getTime() + days * DAY).toISOString(),
  }));
  return { days, items };
}

function getEntry(db: Db, id: string) {
  const row = db.select().from(trash).where(eq(trash.id, id)).get();
  if (!row) throw notFound('Not in the trash (it may have been deleted for good)');
  return row;
}

export const trashKindOf = (db: Db, id: string): TrashKind => getEntry(db, id).kind;

export function deleteFromTrash(db: Db, id: string) {
  if (db.delete(trash).where(eq(trash.id, id)).run().changes === 0) throw notFound('Not in the trash');
}

export function emptyTrash(db: Db): number {
  return db.delete(trash).run().changes;
}

// ---- Restoring ----------------------------------------------------------------------------------

const taken = () => conflict('Something with the same id exists again (restored before, or imported from a backup)');

/**
 * Links records back that lost their link when it was deleted (`link` updates one chunk of ids,
 * and only rows whose link is still empty: they may have been linked elsewhere since).
 */
function relink(which: string[] | undefined, link: (chunk: string[]) => void) {
  for (let i = 0; i < (which?.length ?? 0); i += 500) link(which!.slice(i, i + 500));
}

/** Changes the snapshots of records of a kind that are (still) in the trash. */
function editTrashed(db: Db, kind: TrashKind, itemIds: string[] | undefined, edit: (snap: Snapshot) => void) {
  relink(itemIds, (chunk) => {
    for (const entry of db.select().from(trash).where(and(eq(trash.kind, kind), inArray(trash.itemId, chunk))).all()) {
      const snap = entry.data as unknown as Snapshot;
      edit(snap);
      db.update(trash).set({ data: snap as unknown as Record<string, unknown> }).where(eq(trash.id, entry.id)).run();
    }
  });
}

type ParentTable = typeof recipes | typeof batches | typeof vessels;
type LinkList = 'batches' | 'devices' | 'txs';

/**
 * The link of a restored record to its recipe, batch or vessel: kept when that exists. When it is
 * in the trash itself, it is told about the link, so restoring it later links the record again.
 */
function parentLink(db: Db, table: ParentTable, kind: TrashKind, parentId: string | null | undefined, list: LinkList, childId: string): string | null {
  if (!parentId) return null;
  if (exists(db, table, parentId)) return parentId;
  editTrashed(db, kind, [parentId], (snap) => {
    snap[list] = [...new Set([...(snap[list] ?? []), childId])];
  });
  return null;
}

function restoreSnapshot(db: Db, kind: TrashKind, itemId: string, snap: Snapshot) {
  switch (kind) {
    case 'recipe': {
      if (exists(db, recipes, itemId)) throw taken();
      db.insert(recipes).values(revive(recipes, snap.row) as RecipeRow).run();
      relink(snap.batches, (chunk) =>
        db.update(batches).set({ recipeId: itemId }).where(and(inArray(batches.id, chunk), isNull(batches.recipeId))).run(),
      );
      editTrashed(db, 'batch', snap.batches, (s) => void (s.row.recipeId ??= itemId));
      return;
    }
    case 'batch': {
      if (exists(db, batches, itemId)) throw taken();
      const row = revive(batches, snap.row) as BatchRow;
      // Its number was kept free, but a backup import may have used it.
      const numberTaken = db.select({ id: batches.id }).from(batches).where(eq(batches.number, row.number)).get();
      db.insert(batches)
        .values({
          ...row,
          number: numberTaken ? maxBatchNumber(db) + 1 : row.number,
          recipeId: parentLink(db, recipes, 'recipe', row.recipeId, 'batches', itemId),
          vesselId: parentLink(db, vessels, 'vessel', row.vesselId, 'batches', itemId),
        })
        .run();
      for (const r of snap.readings ?? []) db.insert(batchReadings).values(revive(batchReadings, r)).onConflictDoNothing().run();
      for (const l of snap.log ?? []) db.insert(batchLog).values(revive(batchLog, l)).onConflictDoNothing().run();
      relink(snap.devices, (chunk) => db.update(devices).set({ batchId: itemId }).where(and(inArray(devices.id, chunk), isNull(devices.batchId))).run());
      editTrashed(db, 'device', snap.devices, (s) => void (s.row.batchId ??= itemId));
      relink(snap.txs, (chunk) =>
        db.update(inventoryTx).set({ batchId: itemId }).where(and(inArray(inventoryTx.id, chunk), isNull(inventoryTx.batchId))).run(),
      );
      // Its brew-day deductions from stock items that are in the trash.
      if (snap.txs?.length) {
        const txs = new Set(snap.txs);
        const items = db.select({ itemId: trash.itemId }).from(trash).where(eq(trash.kind, 'inventory')).all();
        editTrashed(db, 'inventory', items.map((i) => i.itemId), (s) => {
          for (const tx of s.tx ?? []) if (txs.has(tx.id as string)) tx.batchId ??= itemId;
        });
      }
      return;
    }
    case 'inventory': {
      if (db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).get()) throw taken();
      db.insert(inventoryItems).values(revive(inventoryItems, snap.row) as InventoryRow).run();
      for (const raw of snap.tx ?? []) {
        const tx = revive(inventoryTx, raw);
        db.insert(inventoryTx)
          .values({ ...tx, batchId: parentLink(db, batches, 'batch', tx.batchId, 'txs', tx.id) })
          .onConflictDoNothing()
          .run();
      }
      return;
    }
    case 'library': {
      if (db.select({ id: libraryItems.id }).from(libraryItems).where(eq(libraryItems.id, itemId)).get()) throw taken();
      const row = revive(libraryItems, snap.row) as LibraryRow;
      // A built-in item comes back as built-in, with today's values (under its current key);
      // if that key is taken or no longer bundled, as the brewery's own item.
      const key = row.seedKey ? currentSeedKey(row.seedKey) : null;
      const bundled = key ? seedItem(key) : undefined;
      const keyTaken = key && db.select({ id: libraryItems.id }).from(libraryItems).where(eq(libraryItems.seedKey, key)).get();
      db.insert(libraryItems)
        .values(
          bundled && !keyTaken
            ? { ...row, seedKey: key, source: 'seed', name: bundled.data.name, data: bundled.data as unknown as Record<string, unknown> }
            : { ...row, seedKey: null, source: row.source === 'seed' ? 'user' : row.source },
        )
        .run();
      return;
    }
    case 'equipment': {
      if (db.select({ id: equipmentProfiles.id }).from(equipmentProfiles).where(eq(equipmentProfiles.id, itemId)).get()) throw taken();
      db.insert(equipmentProfiles).values(revive(equipmentProfiles, snap.row)).run();
      if (!getSettings(db).defaultEquipmentId) updateSettings(db, { defaultEquipmentId: itemId });
      return;
    }
    case 'vessel': {
      if (exists(db, vessels, itemId)) throw taken();
      db.insert(vessels).values(revive(vessels, snap.row) as VesselRow).run();
      relink(snap.batches, (chunk) =>
        db.update(batches).set({ vesselId: itemId }).where(and(inArray(batches.id, chunk), isNull(batches.vesselId))).run(),
      );
      relink(snap.devices, (chunk) => db.update(devices).set({ vesselId: itemId }).where(and(inArray(devices.id, chunk), isNull(devices.vesselId))).run());
      editTrashed(db, 'batch', snap.batches, (s) => void (s.row.vesselId ??= itemId));
      editTrashed(db, 'device', snap.devices, (s) => void (s.row.vesselId ??= itemId));
      return;
    }
    case 'device': {
      if (db.select({ id: devices.id }).from(devices).where(eq(devices.id, itemId)).get()) throw taken();
      const row = revive(devices, snap.row) as DeviceRow;
      const tokenTaken = db.select({ id: devices.id }).from(devices).where(eq(devices.token, row.token)).get();
      db.insert(devices)
        .values({
          ...row,
          token: tokenTaken ? randomBytes(24).toString('base64url') : row.token,
          batchId: parentLink(db, batches, 'batch', row.batchId, 'devices', itemId),
          vesselId: parentLink(db, vessels, 'vessel', row.vesselId, 'devices', itemId),
        })
        .run();
      return;
    }
  }
}

/** Restores the record of a kind and id (its latest trash entry): the undo of a delete. */
export function restoreItem(db: Db, kind: TrashKind, itemId: string): TrashRestoreDto {
  const entry = db
    .select({ id: trash.id })
    .from(trash)
    .where(and(eq(trash.kind, kind), eq(trash.itemId, itemId)))
    .orderBy(desc(trash.deletedAt))
    .limit(1)
    .get();
  if (!entry) throw notFound('Not in the trash (it may have been deleted for good)');
  return restoreFromTrash(db, entry.id);
}

/** Puts a deleted record back (with the same id) and removes it from the trash. */
export function restoreFromTrash(db: Db, id: string): TrashRestoreDto {
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const entry = getEntry(t, id);
    restoreSnapshot(t, entry.kind, entry.itemId, entry.data as unknown as Snapshot);
    t.delete(trash).where(eq(trash.id, id)).run();
    return { kind: entry.kind, id: entry.itemId };
  });
}

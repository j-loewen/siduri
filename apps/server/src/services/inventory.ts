import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  adjustInventorySchema,
  createInventoryItemSchema,
  recipeDocSchema,
  updateInventoryItemSchema,
  waterAgentOf,
  WATER_AGENT_INFO,
  type AmountKind,
  type BatchInventoryDto,
  type BatchInventoryLine,
  type InventoryItemDto,
  type InventoryKind,
  type InventoryTxDto,
  type StockDto,
  type WaterAgent,
} from '@brew/shared';
import type { Db } from '../db';
import { batches, inventoryItems, inventoryTx, libraryItems, type InventoryRow } from '../db/schema';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { addLog } from './batches';

export function toItemDto(row: InventoryRow): InventoryItemDto {
  return {
    id: row.id,
    kind: row.kind,
    libraryRef: row.libraryRef,
    name: row.name,
    producer: row.producer,
    amountKind: row.amountKind,
    amount: row.amount,
    minAmount: row.minAmount,
    lot: row.lot,
    bestBefore: row.bestBefore,
    location: row.location,
    unitCost: row.unitCost,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listInventory(db: Db, kind?: InventoryKind, q?: string): InventoryItemDto[] {
  const filters = [kind ? eq(inventoryItems.kind, kind) : undefined, q ? sql`(${inventoryItems.name} like ${likeTerm(q)} escape '\\' or ${inventoryItems.producer} like ${likeTerm(q)} escape '\\')` : undefined].filter(Boolean);
  return db
    .select()
    .from(inventoryItems)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(sql`lower(${inventoryItems.name})`), asc(inventoryItems.bestBefore))
    .all()
    .map(toItemDto);
}

function getRow(db: Db, id: string): InventoryRow {
  const row = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  if (!row) throw notFound('Inventory item not found');
  return row;
}

export const getItem = (db: Db, id: string) => toItemDto(getRow(db, id));

export function createItem(db: Db, raw: unknown): InventoryItemDto {
  const input = parse(createInventoryItemSchema, raw);
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = t.insert(inventoryItems).values({ id: crypto.randomUUID(), ...input }).returning().get();
    if (input.amount > 0) {
      t.insert(inventoryTx).values({ id: crypto.randomUUID(), itemId: row.id, delta: input.amount, reason: 'purchase', at: new Date() }).run();
    }
    return toItemDto(row);
  });
}

export function updateItem(db: Db, id: string, raw: unknown): InventoryItemDto {
  const patch = parse(updateInventoryItemSchema, raw);
  getRow(db, id);
  const row = db.update(inventoryItems).set({ ...patch, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning().get();
  return toItemDto(row);
}

export function deleteItem(db: Db, id: string) {
  if (db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run().changes === 0) throw notFound('Inventory item not found');
}

/** Change an amount (purchase, correction); never below zero. */
export function adjustItem(db: Db, id: string, raw: unknown): InventoryItemDto {
  const input = parse(adjustInventorySchema, raw);
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = getRow(t, id);
    const amount = Math.max(0, row.amount + input.delta);
    const delta = amount - row.amount;
    if (delta === 0) return toItemDto(row);
    t.insert(inventoryTx).values({ id: crypto.randomUUID(), itemId: id, delta, reason: input.reason, note: input.note, at: new Date() }).run();
    return toItemDto(t.update(inventoryItems).set({ amount, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning().get());
  });
}

export function listTransactions(db: Db, itemId: string): InventoryTxDto[] {
  getRow(db, itemId);
  return db
    .select({ tx: inventoryTx, batchNumber: batches.number })
    .from(inventoryTx)
    .leftJoin(batches, eq(batches.id, inventoryTx.batchId))
    .where(eq(inventoryTx.itemId, itemId))
    .orderBy(desc(inventoryTx.at))
    .all()
    .map(({ tx, batchNumber }) => ({
      id: tx.id,
      itemId: tx.itemId,
      batchId: tx.batchId,
      batchNumber: batchNumber ?? null,
      delta: tx.delta,
      reason: tx.reason,
      note: tx.note,
      at: tx.at.toISOString(),
    }));
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
/** Same ingredient by name only when the producers don't differ (an unknown producer matches any). */
const sameProducer = (a: string, b: string) => !norm(a) || !norm(b) || norm(a) === norm(b);

/** Stock summed over lots, per library item (or name and producer). */
export function stockSummary(db: Db): StockDto[] {
  const sums = new Map<string, StockDto>();
  for (const row of db.select().from(inventoryItems).all()) {
    const key = `${row.kind}|${row.amountKind}|${row.libraryRef ?? `name:${norm(row.name)}|${norm(row.producer)}`}`;
    const s = sums.get(key);
    if (s) s.amount += row.amount;
    else sums.set(key, { kind: row.kind, libraryRef: row.libraryRef, name: row.name, producer: row.producer, amountKind: row.amountKind, amount: row.amount });
  }
  return [...sums.values()];
}

export function lowStock(db: Db): InventoryItemDto[] {
  return db
    .select()
    .from(inventoryItems)
    .where(sql`${inventoryItems.minAmount} is not null and ${inventoryItems.amount} <= ${inventoryItems.minAmount}`)
    .orderBy(asc(sql`lower(${inventoryItems.name})`))
    .all()
    .map(toItemDto);
}

// ---- Batches and the inventory ---------------------------------------------------------------------------

interface Need {
  key: string;
  kind: InventoryKind;
  name: string;
  producer: string;
  libraryRef: string | null;
  agent: WaterAgent | null;
  amountKind: AmountKind;
  amount: number;
}

function batchNeeds(db: Db, docRaw: unknown): Need[] {
  const doc = recipeDocSchema.parse(docRaw);
  // Library items of the water agents (their seed keys are fixed).
  const agentItems = new Map(
    db
      .select({ id: libraryItems.id, seedKey: libraryItems.seedKey, name: libraryItems.name })
      .from(libraryItems)
      .where(eq(libraryItems.kind, 'misc'))
      .all()
      .filter((r) => r.seedKey)
      .map((r) => [r.seedKey!, r]),
  );
  const needs: Need[] = [
    ...doc.fermentables.map((f) => ({ key: `gather:${f.id}`, kind: 'fermentable' as const, name: f.name, producer: f.producer, libraryRef: f.libraryRef, agent: null, amountKind: 'mass' as const, amount: f.amountKg })),
    ...doc.hops.map((h) => ({ key: `gather:${h.id}`, kind: 'hop' as const, name: h.name, producer: h.producer, libraryRef: h.libraryRef, agent: null, amountKind: 'mass' as const, amount: h.amountKg })),
    ...doc.cultures.map((c) => ({ key: `gather:${c.id}`, kind: 'culture' as const, name: c.name, producer: c.producer, libraryRef: c.libraryRef, agent: null, amountKind: c.amountKind, amount: c.amount })),
    ...doc.miscs.map((m) => ({ key: `gather:${m.id}`, kind: 'misc' as const, name: m.name, producer: m.producer, libraryRef: m.libraryRef, agent: waterAgentOf(m.name), amountKind: m.amountKind, amount: m.amount })),
    ...doc.water.additions.map((a) => {
      const item = agentItems.get(WATER_AGENT_INFO[a.agent].seedKey);
      return { key: `gather:${a.id}`, kind: 'misc' as const, name: item?.name ?? a.agent, producer: '', libraryRef: item?.id ?? null, agent: a.agent, amountKind: WATER_AGENT_INFO[a.agent].amountKind, amount: a.amount };
    }),
  ];
  return needs.filter((n) => n.amount > 0);
}

/** What the batch needs, which stock covers it (oldest best-before first) and what is missing. */
export function planBatch(db: Db, docRaw: unknown): BatchInventoryLine[] {
  const items = db.select().from(inventoryItems).all();
  const remaining = new Map(items.map((i) => [i.id, i.amount]));
  const ordered = [...items].sort(
    (a, b) => (a.bestBefore ?? '9999').localeCompare(b.bestBefore ?? '9999') || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return batchNeeds(db, docRaw).map((need) => {
    const candidates = ordered.filter(
      (i) =>
        i.kind === need.kind &&
        i.amountKind === need.amountKind &&
        ((need.libraryRef != null && i.libraryRef === need.libraryRef) || (norm(i.name) === norm(need.name) && sameProducer(i.producer, need.producer)) || (need.agent != null && waterAgentOf(i.name) === need.agent)),
    );
    const available = candidates.reduce((s, i) => s + i.amount, 0);
    let missing = need.amount;
    const takes: BatchInventoryLine['takes'] = [];
    for (const item of candidates) {
      if (missing <= 1e-9) break;
      const left = remaining.get(item.id) ?? 0;
      const take = Math.min(left, missing);
      if (take <= 0) continue;
      remaining.set(item.id, left - take);
      missing -= take;
      takes.push({ itemId: item.id, name: item.name, lot: item.lot, amount: take });
    }
    return { key: need.key, kind: need.kind, name: need.name, amountKind: need.amountKind, needed: need.amount, available, takes, short: Math.max(0, missing) };
  });
}

function batchRow(db: Db, id: string) {
  const row = db.select().from(batches).where(eq(batches.id, id)).get();
  if (!row) throw notFound('Batch not found');
  return row;
}

export function batchInventory(db: Db, batchId: string): BatchInventoryDto {
  const row = batchRow(db, batchId);
  return { lines: planBatch(db, row.doc), deductedAt: row.inventoryDeductedAt?.toISOString() ?? null };
}

/** Take the batch's ingredients from stock (what is there; shortages stay on the list). */
export function deductBatch(db: Db, batchId: string): BatchInventoryDto {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = batchRow(t, batchId);
    if (row.inventoryDeductedAt) throw conflict('The ingredients of this batch were already taken from the inventory');
    const now = new Date();
    const lines = planBatch(t, row.doc);
    if (!lines.some((l) => l.takes.length)) throw badRequest('Nothing in the inventory matches this batch');
    for (const line of lines) {
      for (const take of line.takes) {
        t.update(inventoryItems).set({ amount: sql`max(0, ${inventoryItems.amount} - ${take.amount})`, updatedAt: now }).where(eq(inventoryItems.id, take.itemId)).run();
        t.insert(inventoryTx).values({ id: crypto.randomUUID(), itemId: take.itemId, batchId, delta: -take.amount, reason: 'brewday', note: line.name, at: now }).run();
      }
    }
    t.update(batches).set({ inventoryDeductedAt: now, updatedAt: now }).where(eq(batches.id, batchId)).run();
    addLog(t, batchId, 'event', 'inventoryDeducted', now);
  });
  return batchInventory(db, batchId);
}

/** Put back what the batch took (items deleted since are skipped). */
export function undoBatchDeduction(db: Db, batchId: string): BatchInventoryDto {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = batchRow(t, batchId);
    if (!row.inventoryDeductedAt) throw conflict('Nothing was taken from the inventory for this batch');
    const now = new Date();
    const taken = t
      .select()
      .from(inventoryTx)
      .where(and(eq(inventoryTx.batchId, batchId), eq(inventoryTx.reason, 'brewday'), isNull(inventoryTx.undoneAt)))
      .all();
    for (const tk of taken) {
      t.update(inventoryItems).set({ amount: sql`${inventoryItems.amount} + ${-tk.delta}`, updatedAt: now }).where(eq(inventoryItems.id, tk.itemId)).run();
      t.insert(inventoryTx).values({ id: crypto.randomUUID(), itemId: tk.itemId, batchId, delta: -tk.delta, reason: 'undo', note: tk.note, at: now }).run();
      t.update(inventoryTx).set({ undoneAt: now }).where(eq(inventoryTx.id, tk.id)).run();
    }
    t.update(batches).set({ inventoryDeductedAt: null, updatedAt: now }).where(eq(batches.id, batchId)).run();
    addLog(t, batchId, 'event', 'inventoryRestored', now);
  });
  return batchInventory(db, batchId);
}

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  batchCarbonationSchema,
  batchMeasuredSchema,
  brewDayStateSchema,
  recipeDocSchema,
  type BatchDto,
  type BatchStatus,
  type BatchSummaryDto,
  type BrewDayAction,
  type BrewDayState,
  type CreateBatchInput,
  type LogEntryDto,
  type PatchBatchInput,
  type ReadingDto,
  type RecipeDoc,
} from '@brew/shared';
import { createBatchSchema, createReadingSchema } from '@brew/shared';
import { calculateRecipe, fermentationSchedule, scaleRecipe } from '@brew/brewcalc';
import type { Db } from '../db';
import { batches, batchLog, batchReadings, type BatchRow, type LogRow, type ReadingRow } from '../db/schema';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { getEquipment } from './equipment';
import { getVessel } from './vessels';
import { createRecipe, getRecipe, updateRecipe } from './recipes';

const today = () => new Date().toISOString().slice(0, 10);

function fermentationStart(row: BatchRow, brewday: BrewDayState): string | null {
  if (brewday.finishedAt) return brewday.finishedAt;
  return row.brewDate && row.status !== 'planned' && row.status !== 'brewing' ? `${row.brewDate}T12:00:00.000Z` : null;
}

export function toReadingDto(row: ReadingRow): ReadingDto {
  return { id: row.id, takenAt: row.takenAt.toISOString(), gravity: row.gravity, tempC: row.tempC, note: row.note, source: row.source };
}

const toLogDto = (row: LogRow): LogEntryDto => ({ id: row.id, at: row.at.toISOString(), kind: row.kind, text: row.text });

export function toBatchDto(row: BatchRow): BatchDto {
  const brewday = brewDayStateSchema.parse(row.brewday);
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    status: row.status,
    recipeId: row.recipeId,
    vesselId: row.vesselId,
    brewDate: row.brewDate,
    fermentationStart: fermentationStart(row, brewday),
    measured: batchMeasuredSchema.parse(row.measured),
    doc: recipeDocSchema.parse(row.doc),
    carbonation: batchCarbonationSchema.parse(row.carbonation),
    version: row.version,
    brewday,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    serverTime: Date.now(),
  };
}

function getRow(db: Db, id: string): BatchRow {
  const row = db.select().from(batches).where(eq(batches.id, id)).get();
  if (!row) throw notFound('Batch not found');
  return row;
}

export const getBatch = (db: Db, id: string) => toBatchDto(getRow(db, id));

export function listBatches(db: Db, statuses?: BatchStatus[]): BatchSummaryDto[] {
  const rows = db
    .select()
    .from(batches)
    .where(statuses?.length ? inArray(batches.status, statuses) : undefined)
    .orderBy(desc(batches.number))
    .all();
  return rows.map((row) => {
    const doc = recipeDocSchema.parse(row.doc);
    const calc = calculateRecipe(doc);
    const latest = db.select().from(batchReadings).where(eq(batchReadings.batchId, row.id)).orderBy(desc(batchReadings.takenAt)).limit(1).get();
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status,
      styleName: doc.style?.name ?? null,
      image: doc.image,
      recipeId: row.recipeId,
      vesselId: row.vesselId,
      brewDate: row.brewDate,
      fermentationStart: fermentationStart(row, brewDayStateSchema.parse(row.brewday)),
      plannedOg: calc.og,
      plannedFg: calc.fg,
      colorEbc: calc.colorEbc,
      measured: batchMeasuredSchema.parse(row.measured),
      latestReading: latest ? toReadingDto(latest) : null,
      schedule: fermentationSchedule(doc),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export function addLog(db: Db, batchId: string, kind: 'note' | 'event', text: string, at = new Date()) {
  db.insert(batchLog).values({ id: crypto.randomUUID(), batchId, at, kind, text }).run();
}

/** A new batch from a recipe, optionally scaled to an equipment profile. */
export function createBatch(db: Db, raw: CreateBatchInput): BatchDto {
  const input = parse(createBatchSchema, raw);
  const recipe = getRecipe(db, input.recipeId);
  if (input.vesselId) getVessel(db, input.vesselId);
  let doc: RecipeDoc = structuredClone(recipe.doc);
  if (input.equipmentId) {
    const eq = getEquipment(db, input.equipmentId).data;
    doc = scaleRecipe(doc, eq.batchVolumeL, eq.brewhouseEfficiencyPct);
    doc = { ...doc, equipment: { ...eq, libraryRef: input.equipmentId }, boilTimeMin: doc.boilTimeMin || eq.boilTimeMin };
  }
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const number = (t.select({ n: sql<number>`coalesce(max(${batches.number}), 0)` }).from(batches).get()?.n ?? 0) + 1;
    const row = t
      .insert(batches)
      .values({ id: crypto.randomUUID(), number, name: input.name || recipe.doc.name, recipeId: recipe.id, vesselId: input.vesselId, doc, brewDate: input.brewDate })
      .returning()
      .get();
    addLog(t, row.id, 'event', 'created');
    return toBatchDto(row);
  });
}

/** Save the batch's recipe document (optimistic concurrency like recipes). */
export function updateBatchDoc(db: Db, id: string, doc: RecipeDoc, version: number): BatchDto {
  const row = db
    .update(batches)
    .set({ doc, version: sql`${batches.version} + 1`, updatedAt: new Date() })
    .where(and(eq(batches.id, id), eq(batches.version, version)))
    .returning()
    .get();
  if (!row) {
    getRow(db, id);
    throw conflict('The batch was changed elsewhere. Reload to see the latest version.');
  }
  return toBatchDto(row);
}

export function patchBatch(db: Db, id: string, patch: PatchBatchInput): BatchDto {
  const row = getRow(db, id);
  if (patch.vesselId) getVessel(db, patch.vesselId);
  const measured = patch.measured ? batchMeasuredSchema.parse({ ...row.measured, ...patch.measured }) : undefined;
  const carbonation = patch.carbonation ? batchCarbonationSchema.parse({ ...row.carbonation, ...patch.carbonation }) : undefined;
  const updated = db
    .update(batches)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.brewDate !== undefined && { brewDate: patch.brewDate }),
      ...(patch.vesselId !== undefined && { vesselId: patch.vesselId }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(measured && { measured }),
      ...(carbonation && { carbonation }),
      updatedAt: new Date(),
    })
    .where(eq(batches.id, id))
    .returning()
    .get();
  if (patch.status && patch.status !== row.status) addLog(db, id, 'event', `status:${patch.status}`);
  return toBatchDto(updated);
}

export function deleteBatch(db: Db, id: string) {
  if (db.delete(batches).where(eq(batches.id, id)).run().changes === 0) throw notFound('Batch not found');
}

/** Apply a brew-day action with the server's clock, so every device sees the same timers. */
export function applyBrewDayAction(db: Db, id: string, action: BrewDayAction, now = Date.now()): BatchDto {
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = getRow(t, id);
    const state = brewDayStateSchema.parse(row.brewday);
    let status = row.status;
    let brewDate = row.brewDate;
    const timer = (timerId: string) => state.timers[timerId] ?? { startedAt: null, elapsedMs: 0 };

    switch (action.type) {
      case 'start':
        if (!state.startedAt) {
          state.startedAt = new Date(now).toISOString();
          addLog(t, id, 'event', 'brewdayStarted', new Date(now));
        }
        if (status === 'planned') status = 'brewing';
        brewDate ??= today();
        break;
      case 'goto':
        state.stepId = action.stepId;
        break;
      case 'check': {
        const set = new Set(state.checked);
        if (action.checked) set.add(action.key);
        else set.delete(action.key);
        state.checked = [...set];
        break;
      }
      case 'timerStart': {
        const tm = timer(action.timerId);
        if (tm.startedAt == null) state.timers[action.timerId] = { startedAt: now, elapsedMs: tm.elapsedMs };
        break;
      }
      case 'timerPause': {
        const tm = timer(action.timerId);
        if (tm.startedAt != null) state.timers[action.timerId] = { startedAt: null, elapsedMs: tm.elapsedMs + Math.max(0, now - tm.startedAt) };
        break;
      }
      case 'timerReset':
        delete state.timers[action.timerId];
        break;
      case 'timerSet': {
        const tm = timer(action.timerId);
        state.timers[action.timerId] = { startedAt: tm.startedAt == null ? null : now, elapsedMs: action.elapsedMs };
        break;
      }
      case 'finish': {
        if (!state.startedAt) throw badRequest('The brew day has not started');
        if (!state.finishedAt) {
          state.finishedAt = new Date(now).toISOString();
          // Stop all timers.
          for (const [key, tm] of Object.entries(state.timers)) {
            if (tm.startedAt != null) state.timers[key] = { startedAt: null, elapsedMs: tm.elapsedMs + (now - tm.startedAt) };
          }
          addLog(t, id, 'event', 'brewdayFinished', new Date(now));
          const og = batchMeasuredSchema.parse(row.measured).og;
          if (og != null) {
            t.insert(batchReadings).values({ id: crypto.randomUUID(), batchId: id, takenAt: new Date(now), gravity: og, tempC: null, note: 'OG', source: 'manual' }).run();
          }
        }
        if (status === 'planned' || status === 'brewing') status = 'fermenting';
        break;
      }
      case 'reopen':
        state.finishedAt = null;
        if (status === 'fermenting') status = 'brewing';
        break;
    }

    const updated = t
      .update(batches)
      .set({ brewday: state, status, brewDate, updatedAt: new Date(now) })
      .where(eq(batches.id, id))
      .returning()
      .get();
    return toBatchDto(updated);
  });
}

/** Copy the batch's recipe back: overwrite the source recipe, or save it as a new recipe. */
export function saveBatchToRecipe(db: Db, id: string, mode: 'update' | 'new', name?: string) {
  const row = getRow(db, id);
  const doc = recipeDocSchema.parse(row.doc);
  if (mode === 'update') {
    if (!row.recipeId) throw badRequest('The recipe this batch came from no longer exists; save it as a new recipe');
    const current = getRecipe(db, row.recipeId);
    return updateRecipe(db, current.id, { ...doc, name: current.doc.name }, current.version);
  }
  const recipe = createRecipe(db, { ...doc, name: (name ?? `${doc.name} (#${row.number})`).slice(0, 120) });
  db.update(batches).set({ recipeId: recipe.id, updatedAt: new Date() }).where(eq(batches.id, id)).run();
  return recipe;
}

// ---- Readings and log ----------------------------------------------------------------------------------

export function listReadings(db: Db, batchId: string): ReadingDto[] {
  getRow(db, batchId);
  return db.select().from(batchReadings).where(eq(batchReadings.batchId, batchId)).orderBy(asc(batchReadings.takenAt)).all().map(toReadingDto);
}

export function addReading(db: Db, batchId: string, raw: unknown): ReadingDto {
  getRow(db, batchId);
  const input = parse(createReadingSchema, raw);
  const row = db
    .insert(batchReadings)
    .values({
      id: crypto.randomUUID(),
      batchId,
      takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
      gravity: input.gravity,
      tempC: input.tempC,
      note: input.note,
      source: 'manual',
    })
    .returning()
    .get();
  return toReadingDto(row);
}

export function deleteReading(db: Db, batchId: string, readingId: string) {
  const res = db.delete(batchReadings).where(and(eq(batchReadings.id, readingId), eq(batchReadings.batchId, batchId))).run();
  if (res.changes === 0) throw notFound('Reading not found');
}

export function listLog(db: Db, batchId: string): LogEntryDto[] {
  getRow(db, batchId);
  return db.select().from(batchLog).where(eq(batchLog.batchId, batchId)).orderBy(desc(batchLog.at)).all().map(toLogDto);
}

export function addNote(db: Db, batchId: string, text: string, at?: string): LogEntryDto {
  getRow(db, batchId);
  const row = db
    .insert(batchLog)
    .values({ id: crypto.randomUUID(), batchId, at: at ? new Date(at) : new Date(), kind: 'note', text })
    .returning()
    .get();
  return toLogDto(row);
}

export function deleteNote(db: Db, batchId: string, entryId: string) {
  const res = db.delete(batchLog).where(and(eq(batchLog.id, entryId), eq(batchLog.batchId, batchId), eq(batchLog.kind, 'note'))).run();
  if (res.changes === 0) throw notFound('Note not found');
}

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { createVesselSchema, OCCUPYING_STATUSES, updateVesselSchema, type VesselDto } from '@brew/shared';
import type { Db } from '../db';
import { batches, vessels, type VesselRow } from '../db/schema';
import { notFound, parse } from '../lib/errors';
import { keepInTrash } from './trash';

function currentBatch(db: Db, vesselId: string): VesselDto['currentBatch'] {
  const row = db
    .select({ id: batches.id, number: batches.number, name: batches.name, status: batches.status })
    .from(batches)
    .where(and(eq(batches.vesselId, vesselId), inArray(batches.status, OCCUPYING_STATUSES)))
    .orderBy(desc(batches.number))
    .limit(1)
    .get();
  return row ?? null;
}

const toDto = (db: Db, row: VesselRow): VesselDto => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  capacityL: row.capacityL,
  notes: row.notes,
  currentBatch: currentBatch(db, row.id),
});

export function listVessels(db: Db): VesselDto[] {
  return db
    .select()
    .from(vessels)
    .orderBy(asc(vessels.kind), asc(sql`lower(${vessels.name})`))
    .all()
    .map((r) => toDto(db, r));
}

export function getVessel(db: Db, id: string): VesselDto {
  const row = db.select().from(vessels).where(eq(vessels.id, id)).get();
  if (!row) throw notFound('Vessel not found');
  return toDto(db, row);
}

export function createVessel(db: Db, raw: unknown): VesselDto {
  const input = parse(createVesselSchema, raw);
  const row = db.insert(vessels).values({ id: crypto.randomUUID(), ...input }).returning().get();
  return toDto(db, row);
}

export function updateVessel(db: Db, id: string, raw: unknown): VesselDto {
  const patch = parse(updateVesselSchema, raw);
  const row = db.update(vessels).set({ ...patch, updatedAt: new Date() }).where(eq(vessels.id, id)).returning().get();
  if (!row) throw notFound('Vessel not found');
  return toDto(db, row);
}

/** Moves it to the trash. Batches that were in it keep their history; their vessel is cleared (until it is restored). */
export function deleteVessel(db: Db, id: string) {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    keepInTrash(t, 'vessel', id);
    if (t.delete(vessels).where(eq(vessels.id, id)).run().changes === 0) throw notFound('Vessel not found');
  });
}

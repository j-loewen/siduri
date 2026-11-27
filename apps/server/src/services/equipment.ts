import { asc, eq, sql } from 'drizzle-orm';
import { equipmentDataSchema, type EquipmentData, type EquipmentDto } from '@brew/shared';
import type { Db } from '../db';
import { equipmentProfiles, type EquipmentRow } from '../db/schema';
import { notFound } from '../lib/errors';
import { getSettings, updateSettings } from './settings';
import { keepInTrash } from './trash';

const toDto = (row: EquipmentRow, defaultId: string | null): EquipmentDto => ({
  id: row.id,
  name: row.name,
  isDefault: row.id === defaultId,
  data: equipmentDataSchema.parse(row.data),
  updatedAt: row.updatedAt.toISOString(),
});

export function listEquipment(db: Db): EquipmentDto[] {
  const { defaultEquipmentId } = getSettings(db);
  return db
    .select()
    .from(equipmentProfiles)
    .orderBy(asc(sql`lower(${equipmentProfiles.name})`))
    .all()
    .map((r) => toDto(r, defaultEquipmentId));
}

export function getEquipment(db: Db, id: string): EquipmentDto {
  const row = db.select().from(equipmentProfiles).where(eq(equipmentProfiles.id, id)).get();
  if (!row) throw notFound('Equipment profile not found');
  return toDto(row, getSettings(db).defaultEquipmentId);
}

export function createEquipment(db: Db, data: EquipmentData): EquipmentDto {
  const row = db.insert(equipmentProfiles).values({ id: crypto.randomUUID(), name: data.name, data }).returning().get();
  // The first profile becomes the default.
  if (!getSettings(db).defaultEquipmentId) updateSettings(db, { defaultEquipmentId: row.id });
  return getEquipment(db, row.id);
}

export function updateEquipment(db: Db, id: string, data: EquipmentData): EquipmentDto {
  const row = db
    .update(equipmentProfiles)
    .set({ name: data.name, data, updatedAt: new Date() })
    .where(eq(equipmentProfiles.id, id))
    .returning()
    .get();
  if (!row) throw notFound('Equipment profile not found');
  return getEquipment(db, id);
}

/** Moves it to the trash; another profile becomes the default if it was. */
export function deleteEquipment(db: Db, id: string) {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    keepInTrash(t, 'equipment', id);
    if (t.delete(equipmentProfiles).where(eq(equipmentProfiles.id, id)).run().changes === 0) throw notFound('Equipment profile not found');
    if (getSettings(t).defaultEquipmentId === id) {
      const next = t.select({ id: equipmentProfiles.id }).from(equipmentProfiles).limit(1).get();
      updateSettings(t, { defaultEquipmentId: next?.id ?? null });
    }
  });
}

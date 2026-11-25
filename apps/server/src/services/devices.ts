import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  createDeviceSchema,
  HYDROMETER_TYPES,
  OCCUPYING_STATUSES,
  updateDeviceSchema,
  type DeviceDto,
  type DevicePayloadDto,
  type Telemetry,
} from '@brew/shared';
import type { Db } from '../db';
import { batches, batchReadings, devices, vessels, type DeviceRow } from '../db/schema';
import { notFound, parse } from '../lib/errors';

const RECENT = 10;
const newToken = () => randomBytes(24).toString('base64url');

type BatchRef = DeviceDto['currentBatch'];

/** The batch a device's readings go to: linked directly (unless finished), else the one in its vessel. */
export function deviceBatch(db: Db, row: Pick<DeviceRow, 'batchId' | 'vesselId'>): BatchRef {
  const cols = { id: batches.id, number: batches.number, name: batches.name, status: batches.status };
  if (row.batchId) {
    const b = db.select(cols).from(batches).where(and(eq(batches.id, row.batchId), ne(batches.status, 'completed'))).get();
    if (b) return b;
  }
  if (row.vesselId) {
    return (
      db
        .select(cols)
        .from(batches)
        .where(and(eq(batches.vesselId, row.vesselId), inArray(batches.status, OCCUPYING_STATUSES)))
        .orderBy(desc(batches.number))
        .limit(1)
        .get() ?? null
    );
  }
  return null;
}

export function toDeviceDto(db: Db, row: DeviceRow): DeviceDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    externalId: row.externalId,
    vesselId: row.vesselId,
    batchId: row.batchId,
    token: row.token,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    lastTelemetry: row.lastTelemetry ?? null,
    currentBatch: deviceBatch(db, row),
    recent: row.recent ?? [],
  };
}

function getRow(db: Db, id: string): DeviceRow {
  const row = db.select().from(devices).where(eq(devices.id, id)).get();
  if (!row) throw notFound('Device not found');
  return row;
}

export const getDevice = (db: Db, id: string) => toDeviceDto(db, getRow(db, id));

export function listDevices(db: Db): DeviceDto[] {
  return db
    .select()
    .from(devices)
    .orderBy(asc(sql`lower(${devices.name})`))
    .all()
    .map((r) => toDeviceDto(db, r));
}

function checkLinks(db: Db, links: { vesselId?: string | null; batchId?: string | null }) {
  if (links.vesselId && !db.select({ id: vessels.id }).from(vessels).where(eq(vessels.id, links.vesselId)).get()) throw notFound('Vessel not found');
  if (links.batchId && !db.select({ id: batches.id }).from(batches).where(eq(batches.id, links.batchId)).get()) throw notFound('Batch not found');
}

export function createDevice(db: Db, raw: unknown): DeviceDto {
  const input = parse(createDeviceSchema, raw);
  checkLinks(db, input);
  const row = db.insert(devices).values({ id: crypto.randomUUID(), token: newToken(), ...input }).returning().get();
  return toDeviceDto(db, row);
}

export function updateDevice(db: Db, id: string, raw: unknown): DeviceDto {
  const patch = parse(updateDeviceSchema, raw);
  getRow(db, id);
  checkLinks(db, patch);
  return toDeviceDto(db, db.update(devices).set({ ...patch, updatedAt: new Date() }).where(eq(devices.id, id)).returning().get());
}

/** A new push URL; the old one stops working. */
export function regenerateToken(db: Db, id: string): DeviceDto {
  getRow(db, id);
  return toDeviceDto(db, db.update(devices).set({ token: newToken(), updatedAt: new Date() }).where(eq(devices.id, id)).returning().get());
}

export function deleteDevice(db: Db, id: string) {
  if (db.delete(devices).where(eq(devices.id, id)).run().changes === 0) throw notFound('Device not found');
}

/**
 * Store measurements of a device: newer than what it already has. Hydrometer readings go into the
 * linked batch's fermentation readings; controllers only keep their latest state. Returns how many
 * readings were added to a batch.
 */
export function recordTelemetry(db: Db, deviceId: string, items: Telemetry[], raw: string): { added: number; batchId: string | null } {
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const row = getRow(t, deviceId);
    const since = row.lastSeenAt?.getTime() ?? 0;
    const fresh = items.filter((i) => Date.parse(i.at) > since).sort((a, b) => a.at.localeCompare(b.at));
    const latest = fresh.at(-1) ?? null;
    const batch = deviceBatch(t, row);
    let added = 0;
    if (batch && HYDROMETER_TYPES.includes(row.type)) {
      for (const i of fresh) {
        if (i.gravity == null && i.tempC == null) continue;
        t.insert(batchReadings)
          .values({ id: crypto.randomUUID(), batchId: batch.id, takenAt: new Date(i.at), gravity: i.gravity, tempC: i.tempC, note: '', source: 'device', deviceId })
          .run();
        added++;
      }
    }
    const payload: DevicePayloadDto = { at: new Date().toISOString(), raw: raw.slice(0, 2000), telemetry: latest ?? items.at(-1) ?? null };
    t.update(devices)
      .set({
        ...(latest && { lastSeenAt: new Date(latest.at), lastTelemetry: latest }),
        recent: [payload, ...(row.recent ?? [])].slice(0, RECENT),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, deviceId))
      .run();
    return { added, batchId: added ? batch!.id : null };
  });
}

export const findDeviceByToken = (db: Db, token: string) => db.select().from(devices).where(eq(devices.token, token)).get();

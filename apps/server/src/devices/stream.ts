import { randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { RAPT_TYPES, type DeviceType, type Telemetry } from '@brew/shared';
import type { Db } from '../db';
import { devices, integrations } from '../db/schema';
import { createDevice } from '../services/devices';
import { normaliseGravity, normaliseTemperature } from './telemetry';

/**
 * Streams: one URL and one key for all devices of a kind, which name their device in each message.
 * A device is found by its id there (`externalId`), or added on its first message.
 *
 * - RAPT "Brew Data Stream" (Custom): an envelope per device (`{ event, deviceId, deviceType, name,
 *   timestamp, data: {…} }`). The key is a header the user adds in the RAPT portal
 *   (`Authorization: Bearer <key>`); RAPT's own signature is not checked (undocumented).
 * - Tilt cloud logging (Tilt app, TiltPi): form data `Timepoint, Temp, SG, Beer, Color, Comment`
 *   (https://tilthydrometer.com/pages/tilt-cloud-logging-api). The apps only take a URL, so the key
 *   is part of the path. Each Tilt colour is one device.
 */

export type StreamId = 'rapt_stream' | 'tilt_stream';
export const RAPT_STREAM_PATH = '/api/integrations/rapt';
export const TILT_STREAM_PATH = '/api/integrations/tilt';

const newKey = () => randomBytes(24).toString('base64url');

/** The stream's key, created on first use. */
export function streamKey(db: Db, id: StreamId): string {
  const key = (db.select().from(integrations).where(eq(integrations.id, id)).get()?.data as { key?: string } | undefined)?.key;
  return key ?? regenerateStreamKey(db, id);
}

/** A new key; senders with the old one stop working. */
export function regenerateStreamKey(db: Db, id: StreamId): string {
  const key = newKey();
  db.insert(integrations)
    .values({ id, data: { key } })
    .onConflictDoUpdate({ target: integrations.id, set: { data: { key }, updatedAt: new Date() } })
    .run();
  return key;
}

/** The key a request carries: `Authorization: Bearer <key>` (or the bare key), `X-Api-Key`, or `?key=`. */
export function keyOfRequest(headers: Record<string, string | string[] | undefined>, query: Record<string, unknown>): string | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
  const auth = first(headers.authorization);
  if (auth) return auth.replace(/^bearer\s+/i, '').trim();
  return first(headers['x-api-key']) ?? (typeof query.key === 'string' ? query.key.trim() || null : null);
}

export function sameKey(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Device type from RAPT's `deviceType` ("PillHydrometer", "TemperatureController", …). */
export function raptTypeOf(deviceType: unknown, hasGravity: boolean): DeviceType {
  const t = String(deviceType ?? '').toLowerCase();
  if (t.includes('pill') || t.includes('hydrometer')) return 'rapt_pill';
  if (t.includes('chamber') || t.includes('fridge')) return 'rapt_chamber';
  if (t.includes('controller') || t.includes('temperature')) return 'rapt_controller';
  return hasGravity ? 'rapt_pill' : 'rapt_controller';
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** RAPT id and name of the device a stream message is about. */
export function streamDeviceOf(payload: Record<string, unknown>): { externalId: string; name: string } | null {
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};
  const externalId = str(payload.deviceId ?? payload.device_id ?? data.deviceId ?? payload.macAddress).slice(0, 80);
  const name = str(payload.name ?? payload.deviceName ?? payload.device_name ?? data.name).slice(0, 80);
  if (!externalId && !name) return null;
  return { externalId: externalId || name, name: name || externalId };
}

/** The device of these types with this id, added (without a fermenter) when it is new. */
export function findOrAddStreamDevice(db: Db, who: { externalId: string; name: string }, type: DeviceType, types: DeviceType[]): { id: string; added: boolean } {
  const row = db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.externalId, who.externalId), inArray(devices.type, types)))
    .get();
  if (row) return { id: row.id, added: false };
  return { id: createDevice(db, { name: who.name, type, externalId: who.externalId }).id, added: true };
}

export const findOrAddRaptDevice = (db: Db, who: { externalId: string; name: string }, type: DeviceType) => findOrAddStreamDevice(db, who, type, RAPT_TYPES);

export const TILT_COLORS = ['RED', 'GREEN', 'BLACK', 'PURPLE', 'ORANGE', 'BLUE', 'YELLOW', 'PINK'] as const;

/**
 * The Tilt a cloud-logging post is about: its colour ("PINK", or "PINK:aa:bb:…" when the app
 * identifies Tilts by MAC address). Named "Tilt Pink".
 */
export function tiltDeviceOf(payload: Record<string, unknown>): { externalId: string; name: string } | null {
  const color = str(payload.Color ?? payload.color).slice(0, 80);
  const base = (color.split(':')[0] ?? '').toUpperCase();
  if (!(TILT_COLORS as readonly string[]).includes(base)) return null;
  const word = base.charAt(0) + base.slice(1).toLowerCase();
  const mac = color.slice(base.length + 1).toLowerCase();
  return mac ? { externalId: `${base}:${mac}`, name: `Tilt ${word} (${mac.slice(-5)})` } : { externalId: base, name: `Tilt ${word}` };
}

/**
 * A Tilt reading: SG (always SG; 4 decimals for a Tilt Pro) and Temp (always °F). Timepoint is the
 * phone's local time without its time zone, so the time of arrival is used instead.
 */
export function tiltTelemetry(payload: Record<string, unknown>, now = new Date()): Telemetry | null {
  const num = (v: unknown) => {
    const n = Number(str(v).replace(',', '.'));
    return str(v) !== '' && Number.isFinite(n) ? n : null;
  };
  const gravity = normaliseGravity(num(payload.SG ?? payload.sg));
  const tempC = normaliseTemperature(num(payload.Temp ?? payload.temp), 'F');
  if (gravity == null && tempC == null) return null;
  return { at: now.toISOString(), gravity: gravity == null ? null : Math.round(gravity * 100000) / 100000, tempC, targetTempC: null, battery: null, rssi: null };
}

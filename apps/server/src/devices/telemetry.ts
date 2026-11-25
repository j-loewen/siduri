import { platoToSg, type Telemetry } from '@brew/shared';

/**
 * Reads a measurement out of whatever a device or cloud sends: RAPT API telemetry, the RAPT
 * "Custom" Brew Data Stream (`{ event, deviceId, name, timestamp, data: { gravity, temperature, … } }`),
 * iSpindel's HTTP post, or similar JSON / form data. Field names are matched loosely (case, `_`, `-`
 * ignored) and values normalised to canonical units.
 */

const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const GRAVITY_KEYS = ['gravity', 'sg', 'specificgravity', 'gravitysg', 'currentgravity'];
const PLATO_KEYS = ['plato', 'gravityplato', 'gravityp'];
const TEMP_KEYS = ['temperature', 'temp', 'tempc', 'temperaturec', 'currenttemperature', 'beertemperature', 'beertemp'];
const TARGET_KEYS = ['targettemperature', 'targettemp', 'target', 'setpoint'];
const BATTERY_KEYS = ['battery', 'batt', 'batterylevel', 'batterypercent', 'batteryvoltage'];
const RSSI_KEYS = ['rssi', 'wifirssi', 'signal'];
const TIME_KEYS = ['createdon', 'timestamp', 'time', 'date', 'datetime', 'measuredat', 'createdat'];
const TEMP_UNIT_KEYS = ['tempunits', 'tempunit', 'temperatureunit', 'temperatureunits'];
const GRAVITY_UNIT_KEYS = ['gravityunits', 'gravityunit'];

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Flat lookup of the payload's fields (one level of nesting, e.g. `{ data: {...} }`, included). */
function fields(payload: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const add = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) if (!out.has(keyOf(k)) && (typeof v !== 'object' || v === null)) out.set(keyOf(k), v);
  };
  add(payload);
  for (const v of Object.values(payload)) if (v && typeof v === 'object' && !Array.isArray(v)) add(v as Record<string, unknown>);
  return out;
}

const pick = (f: Map<string, unknown>, keys: string[]) => {
  for (const k of keys) if (f.has(k)) return f.get(k);
  return undefined;
};

/**
 * SG from what a device reports: 1.050, 1050 (SG × 1000) or 12.4 (°Plato); null when implausible.
 */
export function normaliseGravity(value: number | null, unit?: string): number | null {
  if (value == null) return null;
  const u = (unit ?? '').toLowerCase();
  if (u.startsWith('p') || u === '°p') return value >= -2 && value <= 40 ? platoToSg(value) : null;
  if (value >= 0.98 && value <= 1.2) return value;
  if (value >= 980 && value <= 1200) return value / 1000;
  if (value > 1.2 && value <= 40) return platoToSg(value);
  return null;
}

export function normaliseTemperature(value: number | null, unit?: string): number | null {
  if (value == null) return null;
  const u = (unit ?? '').toUpperCase();
  const c = u.startsWith('F') ? ((value - 32) * 5) / 9 : u === 'K' ? value - 273.15 : value;
  return c >= -20 && c <= 110 ? Math.round(c * 100) / 100 : null;
}

function readTime(v: unknown, now: Date): string {
  let d: Date | null = null;
  if (typeof v === 'number') d = new Date(v > 1e12 ? v : v * 1000);
  else if (typeof v === 'string' && v.trim()) d = new Date(v.trim());
  // Ignore unreadable times and clocks far in the future.
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 3600_000) return now.toISOString();
  return d.toISOString();
}

/** A measurement from one telemetry object, or null when it holds nothing we can use. */
export function readTelemetry(payload: unknown, now = new Date()): Telemetry | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const f = fields(payload as Record<string, unknown>);
  const gravityUnit = String(pick(f, GRAVITY_UNIT_KEYS) ?? '');
  const plato = num(pick(f, PLATO_KEYS));
  const gravity = plato != null ? normaliseGravity(plato, 'P') : normaliseGravity(num(pick(f, GRAVITY_KEYS)), gravityUnit);
  const tempUnit = String(pick(f, TEMP_UNIT_KEYS) ?? '');
  const tempC = normaliseTemperature(num(pick(f, TEMP_KEYS)), tempUnit);
  const targetTempC = normaliseTemperature(num(pick(f, TARGET_KEYS)), tempUnit);
  if (gravity == null && tempC == null && targetTempC == null) return null;
  return {
    at: readTime(pick(f, TIME_KEYS), now),
    gravity: gravity == null ? null : Math.round(gravity * 100000) / 100000,
    tempC,
    targetTempC,
    battery: num(pick(f, BATTERY_KEYS)),
    rssi: num(pick(f, RSSI_KEYS)),
  };
}

/** Request bodies come as JSON, form data or text; turn them into an object. */
export function parseBody(body: unknown, query: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof body === 'string') {
    const text = body.trim();
    if (text.startsWith('{')) {
      try {
        return { ...query, ...(JSON.parse(text) as Record<string, unknown>) };
      } catch {
        // Fall through to form data.
      }
    }
    return { ...query, ...Object.fromEntries(new URLSearchParams(text)) };
  }
  if (Array.isArray(body)) return { ...query, ...((body.at(-1) as Record<string, unknown>) ?? {}) };
  if (body && typeof body === 'object') return { ...query, ...(body as Record<string, unknown>) };
  return { ...query };
}

import { z } from 'zod';
import type { BatchStatus } from './batch';

/**
 * Smart brewing devices. Telemetry arrives by push: the device posts to its personal URL, or the
 * RAPT cloud or the Tilt app posts all its devices to one stream URL. Readings go to the batch the
 * device is linked to: directly, or through the fermenter it sits in.
 */
export const DEVICE_TYPES = ['rapt_pill', 'rapt_controller', 'rapt_chamber', 'ispindel', 'tilt', 'other'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Devices that measure gravity (hydrometers) vs. ones that control temperature. */
export const HYDROMETER_TYPES: DeviceType[] = ['rapt_pill', 'ispindel', 'tilt', 'other'];
export const CONTROLLER_TYPES: DeviceType[] = ['rapt_controller', 'rapt_chamber'];
export const RAPT_TYPES: DeviceType[] = ['rapt_pill', 'rapt_controller', 'rapt_chamber'];

const deviceFields = {
  name: z.string().trim().min(1).max(80),
  type: z.enum(DEVICE_TYPES),
  /** Id of the device in its stream (RAPT device id, Tilt colour); messages are matched by it. */
  externalId: z.string().trim().max(80).nullable(),
  vesselId: z.string().max(64).nullable(),
  /** Linked straight to a batch (wins over the vessel's batch). */
  batchId: z.string().max(64).nullable(),
};

export const createDeviceSchema = z.object({
  name: deviceFields.name,
  type: deviceFields.type.default('rapt_pill'),
  externalId: deviceFields.externalId.default(null),
  vesselId: deviceFields.vesselId.default(null),
  batchId: deviceFields.batchId.default(null),
});
export type CreateDeviceInput = z.input<typeof createDeviceSchema>;
// No defaults in patches (zod fills them into missing keys even after .partial()).
export const updateDeviceSchema = z.object(deviceFields).partial();
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

/** One measurement, canonical units. */
export interface Telemetry {
  at: string;
  gravity: number | null;
  tempC: number | null;
  /** Controllers: the temperature they aim for. */
  targetTempC: number | null;
  /** Battery in % (or volts for devices that report that). */
  battery: number | null;
  rssi: number | null;
}

export interface DevicePayloadDto {
  at: string;
  /** What arrived (pushed JSON, or the API's answer), truncated. */
  raw: string;
  /** What was read from it; null when nothing useful was found. */
  telemetry: Telemetry | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  type: DeviceType;
  externalId: string | null;
  vesselId: string | null;
  batchId: string | null;
  /** Secret part of the push URL: POST /api/integrations/telemetry/<token>. */
  token: string;
  lastSeenAt: string | null;
  lastTelemetry: Telemetry | null;
  /** The batch readings currently go to. */
  currentBatch: { id: string; number: number; name: string; status: BatchStatus } | null;
  /** The last few messages, for checking the setup. */
  recent: DevicePayloadDto[];
}

/** Where RAPT's "Custom" Brew Data Stream should post, and the key it sends as a header. */
export interface RaptStreamDto {
  /** Full URL when BASE_URL is set; otherwise the web app puts its own address before `path`. */
  url: string | null;
  path: string;
  /** Sent by RAPT as `Authorization: Bearer <key>`. */
  key: string;
}

/** Where the Tilt app or TiltPi should send its cloud logging: one URL for all Tilts, key included. */
export interface TiltStreamDto {
  /** Full URL when BASE_URL is set; otherwise the web app puts its own address before `path`. */
  url: string | null;
  /** Path including the key: /api/integrations/tilt/<key>. */
  path: string;
}

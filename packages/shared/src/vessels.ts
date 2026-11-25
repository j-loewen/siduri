import { z } from 'zod';
import type { BatchStatus } from './batch';

/** Fermenters, kegs and other vessels a batch can be in. */
export const VESSEL_KINDS = ['fermenter', 'keg', 'bottles', 'other'] as const;
export type VesselKind = (typeof VESSEL_KINDS)[number];

const vesselFields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(VESSEL_KINDS),
  capacityL: z.number().min(0).max(100000).nullable(),
  notes: z.string().max(2000),
};

export const createVesselSchema = z.object({
  name: vesselFields.name,
  kind: vesselFields.kind.default('fermenter'),
  capacityL: vesselFields.capacityL.default(null),
  notes: vesselFields.notes.default(''),
});
export type CreateVesselInput = z.input<typeof createVesselSchema>;
export const updateVesselSchema = z.object(vesselFields).partial();

export interface VesselDto {
  id: string;
  name: string;
  kind: VesselKind;
  capacityL: number | null;
  notes: string;
  /** The batch currently in it (any status between brewing and packaged). */
  currentBatch: { id: string; number: number; name: string; status: BatchStatus } | null;
}

/** Statuses in which a batch occupies its vessel. */
export const OCCUPYING_STATUSES: BatchStatus[] = ['brewing', 'fermenting', 'conditioning', 'packaged'];

import { z } from 'zod';

/**
 * A brewhouse setup: volumes, losses and efficiencies that turn a recipe into water amounts and
 * gravity estimates. Canonical units: L, kg, °C, minutes, %.
 */
export const BREW_METHODS = ['mash_sparge', 'biab', 'no_sparge', 'extract'] as const;
export type BrewMethod = (typeof BREW_METHODS)[number];

const vol = (def: number) => z.number().min(0).max(100000).default(def);

export const equipmentDataSchema = z.object({
  name: z.string().trim().min(1).max(120),
  method: z.enum(BREW_METHODS).default('mash_sparge'),
  /** Target volume into the fermenter. */
  batchVolumeL: z.number().min(0.1).max(100000).default(20),
  boilTimeMin: z.number().min(0).max(600).default(60),
  mashTunVolumeL: z.number().min(0).max(100000).nullable().default(null),
  /** Wort lost in the mash tun, never reaching the kettle ("Mash tun loss"; adds to the total water). */
  mashTunDeadspaceL: vol(0),
  /**
   * Recoverable dead space ("Mash tun dead space"): water below the false bottom or malt pipe that has
   * to be filled before the grain is covered. It runs on into the boil, so it adds to the mash water,
   * not to the total.
   */
  mashTunRecoverableL: vol(0),
  kettleVolumeL: z.number().min(0).max(100000).nullable().default(null),
  boilOffLPerH: vol(3),
  /** Wort left in the kettle and chiller (hop trub, hoses). */
  kettleLossL: vol(1),
  /** Size of the fermenter used with this setup (a batch's own fermenter, if it has one, counts instead). */
  fermenterVolumeL: z.number().min(0).max(100000).nullable().default(null),
  /** Trub and yeast left in the fermenter (lowers packaged volume). */
  fermenterLossL: vol(0.5),
  /** Water added to the fermenter after the boil. */
  topUpWaterL: vol(0),
  grainAbsorptionLPerKg: z.number().min(0).max(5).default(0.96),
  mashThicknessLPerKg: z.number().min(1).max(10).default(3),
  /** Wort shrinks while cooling from boiling. */
  coolingShrinkagePct: z.number().min(0).max(10).default(4),
  mashEfficiencyPct: z.number().min(10).max(100).default(80),
  /** Share of the malt's potential that ends up in the fermenter. */
  brewhouseEfficiencyPct: z.number().min(10).max(100).default(72),
  /** Scales calculated IBUs to match your system (100 = no change). */
  hopUtilizationPct: z.number().min(10).max(200).default(100),
  grainTempC: z.number().min(-10).max(50).default(20),
  notes: z.string().max(4000).default(''),
});
export type EquipmentData = z.infer<typeof equipmentDataSchema>;
export const DEFAULT_EQUIPMENT: EquipmentData = equipmentDataSchema.parse({ name: 'Default' });

export interface EquipmentDto {
  id: string;
  name: string;
  isDefault: boolean;
  data: EquipmentData;
  updatedAt: string;
}

export const equipmentInputSchema = z.object({ data: equipmentDataSchema });
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

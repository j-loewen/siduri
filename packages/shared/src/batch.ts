import { z } from 'zod';
import { recipeDocSchema, type RecipeDoc } from './recipe';

/**
 * A batch: one brew of a recipe. It carries its own copy of the recipe document, so it can be
 * changed (substitutions, a different hop lot) without touching the recipe it came from.
 */

export const BATCH_STATUSES = ['planned', 'brewing', 'fermenting', 'conditioning', 'packaged', 'completed'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
/** Statuses shown as "active" on the dashboard. */
export const ACTIVE_STATUSES: BatchStatus[] = ['brewing', 'fermenting', 'conditioning'];

const gravity = z.number().min(0.98).max(1.2).nullable();
const volume = z.number().min(0).max(100000).nullable();

const measuredFields = {
  mashPh: z.number().min(0).max(14).nullable(),
  preBoilGravity: gravity,
  preBoilVolumeL: volume,
  postBoilVolumeL: volume,
  og: gravity,
  fermenterVolumeL: volume,
  fg: gravity,
  packagedVolumeL: volume,
};

/** Values measured while brewing (canonical units); missing ones are null. */
export const batchMeasuredSchema = z.object(
  Object.fromEntries(Object.entries(measuredFields).map(([k, s]) => [k, s.default(null)])) as {
    [K in keyof typeof measuredFields]: z.ZodDefault<(typeof measuredFields)[K]>;
  },
);

/**
 * A change to some measured values. Built from the fields without defaults: zod 4 fills defaults
 * into missing keys even after .partial(), which would reset every value not sent.
 */
export const batchMeasuredPatchSchema = z.object(measuredFields).partial();
export type BatchMeasured = z.infer<typeof batchMeasuredSchema>;

/** bottle: priming sugar in bottles · keg_sugar: priming sugar in a keg · keg_force: CO2 from a gas bottle. */
export const CARBONATION_METHODS = ['bottle', 'keg_sugar', 'keg_force'] as const;
export type CarbonationMethod = (typeof CARBONATION_METHODS)[number];

const carbonationFields = {
  method: z.enum(CARBONATION_METHODS),
  /** Target, vols CO2. Null: the recipe's carbonation (or its style's). */
  vols: z.number().min(0).max(10).nullable(),
  /**
   * Sugar: the warmest the beer got after fermentation (decides the CO2 left in it) · force: the
   * keg temperature. Null: the warmest fermentation step, or a cold keg.
   */
  tempC: z.number().min(-5).max(50).nullable(),
};

/** How the batch gets carbonated when it is packaged. */
export const batchCarbonationSchema = z.object({
  method: carbonationFields.method.default('bottle'),
  vols: carbonationFields.vols.default(null),
  tempC: carbonationFields.tempC.default(null),
});
export type BatchCarbonation = z.infer<typeof batchCarbonationSchema>;
/** A change to the carbonation settings (no defaults, see batchMeasuredPatchSchema). */
export const batchCarbonationPatchSchema = z.object(carbonationFields).partial();

/** A running or paused timer: elapsed = elapsedMs + (now − startedAt) while running. */
export const timerStateSchema = z.object({
  /** Server time (ms) when it was last started; null while paused. */
  startedAt: z.number().nullable(),
  elapsedMs: z.number().min(0),
});
export type TimerState = z.infer<typeof timerStateSchema>;

export const brewDayStateSchema = z.object({
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  /** Current step (ids from brewDaySteps in @brew/brewcalc). */
  stepId: z.string().max(120).nullable().default(null),
  /** Checklist items ticked off ("gather:<lineId>", "add:<lineId>", …). */
  checked: z.array(z.string().max(200)).max(2000).default([]),
  timers: z.record(z.string().max(120), timerStateSchema).default({}),
});
export type BrewDayState = z.infer<typeof brewDayStateSchema>;

export const EMPTY_BREW_DAY: BrewDayState = brewDayStateSchema.parse({});

/** Elapsed milliseconds of a timer at a (server) time. */
export function timerElapsed(timer: TimerState | undefined, now: number): number {
  if (!timer) return 0;
  return timer.elapsedMs + (timer.startedAt != null ? Math.max(0, now - timer.startedAt) : 0);
}

/** Brew-day changes are sent as actions; the server applies them with its own clock. */
export const brewDayActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('goto'), stepId: z.string().max(120) }),
  z.object({ type: z.literal('check'), key: z.string().max(200), checked: z.boolean() }),
  z.object({ type: z.literal('timerStart'), timerId: z.string().max(120) }),
  z.object({ type: z.literal('timerPause'), timerId: z.string().max(120) }),
  z.object({ type: z.literal('timerReset'), timerId: z.string().max(120) }),
  /** Correct a timer, e.g. when it was started late. */
  z.object({ type: z.literal('timerSet'), timerId: z.string().max(120), elapsedMs: z.number().min(0).max(7 * 24 * 3600 * 1000) }),
  z.object({ type: z.literal('finish') }),
  z.object({ type: z.literal('reopen') }),
]);
export type BrewDayAction = z.infer<typeof brewDayActionSchema>;

// ---- Readings and log ------------------------------------------------------------------------

export const READING_SOURCES = ['manual', 'device'] as const;

export interface ReadingDto {
  id: string;
  takenAt: string;
  gravity: number | null;
  tempC: number | null;
  note: string;
  source: (typeof READING_SOURCES)[number];
}

export const createReadingSchema = z
  .object({
    takenAt: z.iso.datetime({ offset: true }).optional(),
    gravity: z.number().min(0.98).max(1.2).nullable().default(null),
    tempC: z.number().min(-10).max(110).nullable().default(null),
    note: z.string().trim().max(500).default(''),
  })
  .refine((r) => r.gravity != null || r.tempC != null || r.note !== '', { message: 'Enter a gravity, a temperature or a note' });
export type CreateReadingInput = z.input<typeof createReadingSchema>;

export const LOG_KINDS = ['note', 'event'] as const;

export interface LogEntryDto {
  id: string;
  at: string;
  kind: (typeof LOG_KINDS)[number];
  text: string;
}

export const createLogSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  at: z.iso.datetime({ offset: true }).optional(),
});

/** A planned event during fermentation (temperature step, dry hop, …), by day. */
export interface ScheduleEventDto {
  day: number;
  kind: 'step' | 'dryHop' | 'dryHopOut' | 'addition';
  name: string;
  tempC?: number;
  amount?: number;
  amountKind?: 'mass' | 'volume' | 'count';
}

// ---- Batches API ----------------------------------------------------------------------------

export interface BatchSummaryDto {
  id: string;
  number: number;
  name: string;
  status: BatchStatus;
  styleName: string | null;
  /** The recipe picture (from the batch's copy of the recipe). */
  image: string | null;
  recipeId: string | null;
  /** Fermenter or keg the batch is in. */
  vesselId: string | null;
  brewDate: string | null;
  /** When brew day finished: fermentation day 0. */
  fermentationStart: string | null;
  plannedOg: number;
  plannedFg: number;
  colorEbc: number;
  measured: BatchMeasured;
  latestReading: ReadingDto | null;
  /** Fermentation plan from the batch recipe. */
  schedule: ScheduleEventDto[];
  updatedAt: string;
}

export interface BatchDto extends Omit<BatchSummaryDto, 'plannedOg' | 'plannedFg' | 'colorEbc' | 'styleName' | 'latestReading' | 'schedule' | 'image'> {
  doc: RecipeDoc;
  carbonation: BatchCarbonation;
  /** Optimistic concurrency for doc changes. */
  version: number;
  brewday: BrewDayState;
  notes: string;
  createdAt: string;
  /** Server clock (ms) when this was sent: lets devices show the same timer values. */
  serverTime: number;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createBatchSchema = z.object({
  recipeId: z.string().max(64),
  /** Brew the recipe on this equipment (scales to its batch size and efficiency). */
  equipmentId: z.string().max(64).nullable().default(null),
  vesselId: z.string().max(64).nullable().default(null),
  name: z.string().trim().max(120).optional(),
  brewDate: isoDate.nullable().default(null),
});
export type CreateBatchInput = z.input<typeof createBatchSchema>;

export const updateBatchDocSchema = z.object({ doc: recipeDocSchema, version: z.number().int().min(1) });

export const patchBatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(BATCH_STATUSES).optional(),
  brewDate: isoDate.nullable().optional(),
  vesselId: z.string().max(64).nullable().optional(),
  notes: z.string().max(20000).optional(),
  /** Merged into the stored values; null clears one. */
  measured: batchMeasuredPatchSchema.optional(),
  /** Merged into the stored settings. */
  carbonation: batchCarbonationPatchSchema.optional(),
});
export type PatchBatchInput = z.infer<typeof patchBatchSchema>;

export const saveToRecipeSchema = z.object({
  /** update: overwrite the recipe the batch came from · new: save as a new recipe. */
  mode: z.enum(['update', 'new']),
  name: z.string().trim().min(1).max(120).optional(),
});

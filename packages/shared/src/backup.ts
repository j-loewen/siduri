import { z } from 'zod';
import { batchCarbonationSchema, batchMeasuredSchema, BATCH_STATUSES, brewDayStateSchema, LOG_KINDS, READING_SOURCES } from './batch';
import { equipmentDataSchema } from './equipment';
import { INVENTORY_KINDS, INVENTORY_REASONS } from './inventory';
import { AMOUNT_KINDS, LIBRARY_KINDS, LIBRARY_SOURCES } from './library';
import { recipeDocSchema } from './recipe';
import { VESSEL_KINDS } from './vessels';

/**
 * Siduri backup files: the brewery's own data as one JSON file, made in the settings. Records keep
 * their ids, so references between them (batch → recipe, recipe line → library item, batch → vessel)
 * still hold after an import, and importing the same file twice adds nothing the second time.
 */
export const BACKUP_FORMAT = 'siduri-backup';
export const BACKUP_VERSION = 1;

/**
 * What a backup can hold. `equipment` is the equipment profiles and vessels (no smart devices),
 * `water` the user's own water profiles, `library` the user's own library items (other kinds),
 * `settings` the brewery settings and the exporting user's preferences. Never passwords, users,
 * access tokens or device secrets.
 */
export const BACKUP_SECTIONS = ['recipes', 'batches', 'inventory', 'equipment', 'water', 'library', 'settings'] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

/** `?include=recipes,batches`; unknown names are ignored, empty means everything. */
export const backupIncludeSchema = z.object({
  include: z
    .string()
    .max(200)
    .optional()
    .transform((s) => {
      const picked = (s ?? '').split(',').filter((x): x is BackupSection => (BACKUP_SECTIONS as readonly string[]).includes(x));
      return picked.length ? BACKUP_SECTIONS.filter((x) => picked.includes(x)) : [...BACKUP_SECTIONS];
    }),
});

const id = z.string().min(1).max(64);
const ref = id.nullable().default(null);
const time = z.iso.datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const libraryEntrySchema = z.object({
  id,
  kind: z.enum(LIBRARY_KINDS),
  source: z.enum(LIBRARY_SOURCES),
  /** Checked against the kind's schema when importing. */
  data: z.record(z.string(), z.unknown()),
  createdAt: time,
  updatedAt: time,
});

const recipeEntrySchema = z.object({ id, doc: recipeDocSchema, createdAt: time, updatedAt: time });

const batchEntrySchema = z.object({
  id,
  number: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  status: z.enum(BATCH_STATUSES),
  recipeId: ref,
  vesselId: ref,
  inventoryDeductedAt: time.nullable().default(null),
  doc: recipeDocSchema,
  brewDate: isoDate.nullable().default(null),
  measured: batchMeasuredSchema.partial().default({}),
  carbonation: batchCarbonationSchema.partial().default({}),
  brewday: brewDayStateSchema.partial().default({}),
  notes: z.string().max(20000).default(''),
  createdAt: time,
  updatedAt: time,
  readings: z
    .array(
      z.object({
        id,
        takenAt: time,
        gravity: z.number().nullable().default(null),
        tempC: z.number().nullable().default(null),
        note: z.string().max(500).default(''),
        source: z.enum(READING_SOURCES).default('manual'),
      }),
    )
    .max(100000)
    .default([]),
  log: z
    .array(z.object({ id, at: time, kind: z.enum(LOG_KINDS), text: z.string().max(4000) }))
    .max(10000)
    .default([]),
});

const inventoryEntrySchema = z.object({
  id,
  kind: z.enum(INVENTORY_KINDS),
  libraryRef: ref,
  name: z.string().trim().min(1).max(120),
  producer: z.string().max(120).default(''),
  amountKind: z.enum(AMOUNT_KINDS),
  amount: z.number().min(0).max(1e6),
  minAmount: z.number().min(0).max(1e6).nullable().default(null),
  lot: z.string().max(80).default(''),
  bestBefore: isoDate.nullable().default(null),
  location: z.string().max(80).default(''),
  unitCost: z.number().min(0).max(1e6).nullable().default(null),
  notes: z.string().max(2000).default(''),
  createdAt: time,
  updatedAt: time,
  transactions: z
    .array(
      z.object({
        id,
        batchId: ref,
        delta: z.number().min(-1e6).max(1e6),
        reason: z.enum(INVENTORY_REASONS),
        note: z.string().max(500).default(''),
        at: time,
        undoneAt: time.nullable().default(null),
      }),
    )
    .max(10000)
    .default([]),
});

const equipmentEntrySchema = z.object({ id, data: equipmentDataSchema, createdAt: time, updatedAt: time });
const vesselEntrySchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(VESSEL_KINDS),
  capacityL: z.number().min(0).max(100000).nullable().default(null),
  notes: z.string().max(2000).default(''),
  createdAt: time,
  updatedAt: time,
});

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  exportedAt: time,
  /** The sections that were picked when exporting. */
  sections: z.array(z.enum(BACKUP_SECTIONS)),
  recipes: z.array(recipeEntrySchema).max(10000).optional(),
  batches: z.array(batchEntrySchema).max(10000).optional(),
  inventory: z.array(inventoryEntrySchema).max(10000).optional(),
  equipment: z.object({ profiles: z.array(equipmentEntrySchema).max(1000), vessels: z.array(vesselEntrySchema).max(1000) }).optional(),
  water: z.array(libraryEntrySchema).max(10000).optional(),
  library: z.array(libraryEntrySchema).max(50000).optional(),
  settings: z
    .object({
      /** Brewery settings (validated against the settings schema when importing). */
      brewery: z.record(z.string(), z.unknown()),
      /** The exporting user's preferences: theme, language, units. */
      prefs: z.record(z.string(), z.unknown()),
    })
    .optional(),
  /**
   * Built-in library items referred to by the exported data, by id → seed key. Their ids differ
   * between servers; the import finds them by key.
   */
  seedRefs: z.record(id, z.string().max(200)).default({}),
  /** Pictures the exported data uses (recipe and batch pictures, the brewery logo), base64. */
  images: z
    .array(z.object({ id, data: z.string() }))
    .max(20000)
    .default([]),
});
export type BackupFile = z.input<typeof backupFileSchema>;

/** How many records of each section a file holds (for choosing what to import; lenient). */
export function backupContents(raw: unknown): Partial<Record<BackupSection, number>> | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) return null;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const out: Partial<Record<BackupSection, number>> = {};
  const equipment = file.equipment as { profiles?: unknown; vessels?: unknown } | undefined;
  if (Array.isArray(file.recipes)) out.recipes = len(file.recipes);
  if (Array.isArray(file.batches)) out.batches = len(file.batches);
  if (Array.isArray(file.inventory)) out.inventory = len(file.inventory);
  if (equipment && typeof equipment === 'object') out.equipment = len(equipment.profiles) + len(equipment.vessels);
  if (Array.isArray(file.water)) out.water = len(file.water);
  if (Array.isArray(file.library)) out.library = len(file.library);
  if (file.settings && typeof file.settings === 'object') out.settings = 1;
  return out;
}

export interface BackupImportResult {
  /** Per section: records added, and records skipped because they were already there. */
  added: Record<BackupSection, number>;
  skipped: Record<BackupSection, number>;
}

import { z } from 'zod';
import { normalizeOrigin } from './origin';

/**
 * The ingredient library: fermentables, hops, cultures (yeast), other ingredients, water profiles
 * and beer styles. All values in canonical units (EBC, SG, °C, %, ppm). Recipes copy the values
 * they use (snapshots), so editing the library never changes an existing recipe by surprise.
 */

export const LIBRARY_KINDS = ['fermentable', 'hop', 'culture', 'misc', 'water', 'style'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

const name = z.string().trim().min(1).max(120);
const text = (max = 4000) => z.string().max(max).default('');
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);
const pct = optNum(0, 100);
/** Maker: maltster, hop merchant, yeast lab, … */
const producer = z.string().trim().max(120).default('');
/** Country, always the full English name ("Germany", not "DE"). */
const origin = z.string().max(120).transform(normalizeOrigin).default('');

// ---- Fermentables -----------------------------------------------------------------------------

export const FERMENTABLE_TYPES = ['grain', 'sugar', 'extract', 'dry_extract', 'adjunct', 'fruit', 'juice', 'honey', 'other'] as const;
export type FermentableType = (typeof FERMENTABLE_TYPES)[number];
export const GRAIN_GROUPS = ['base', 'caramel', 'roasted', 'smoked', 'specialty', 'adjunct', 'other'] as const;

export const fermentableDataSchema = z.object({
  name,
  type: z.enum(FERMENTABLE_TYPES).default('grain'),
  grainGroup: z.enum(GRAIN_GROUPS).nullable().default(null),
  /** Maltster / manufacturer, e.g. "Weyermann". */
  producer,
  origin,
  productId: text(120),
  colorEbc: z.number().min(0).max(5000).default(0),
  /** Extract potential as the SG of 1 lb in 1 US gal (1.037 for pilsner malt). PPG = (SG − 1) × 1000. */
  potentialSg: z.number().min(1).max(1.05).default(1.037),
  /**
   * Share of the extract the yeast can ferment, relative to normal wort (1 = like malt sugars,
   * 0 = unfermentable such as lactose). Used for the FG estimate.
   */
  fermentability: z.number().min(0).max(1.2).default(1),
  moisturePct: pct,
  proteinPct: pct,
  /** Canonical in °Lintner. */
  diastaticPower: optNum(0, 500),
  maxInBatchPct: pct,
  /** Needs mashing (base and most specialty malts) vs. can be steeped/added to the boil. */
  recommendMash: z.boolean().default(true),
  notes: text(),
});
export type FermentableData = z.infer<typeof fermentableDataSchema>;

// ---- Hops --------------------------------------------------------------------------------------

export const HOP_FORMS = ['pellet', 'leaf', 'plug', 'cryo', 'extract'] as const;
export type HopForm = (typeof HOP_FORMS)[number];
export const HOP_PURPOSES = ['bittering', 'aroma', 'dual'] as const;

export const hopDataSchema = z.object({
  name,
  producer,
  origin,
  form: z.enum(HOP_FORMS).default('pellet'),
  purpose: z.enum(HOP_PURPOSES).nullable().default(null),
  alphaPct: z.number().min(0).max(100).default(5),
  betaPct: pct,
  cohumulonePct: pct,
  /** Total oil, ml per 100 g. */
  totalOil: optNum(0, 20),
  /** Hop storage index (share of alpha lost after 6 months at room temperature). */
  hsi: optNum(0, 1),
  substitutes: text(500),
  notes: text(),
});
export type HopData = z.infer<typeof hopDataSchema>;

// ---- Cultures (yeast, bacteria) ----------------------------------------------------------------

export const CULTURE_TYPES = ['ale', 'lager', 'wheat', 'wine', 'champagne', 'kveik', 'brett', 'lacto', 'pedio', 'mixed', 'other'] as const;
export const CULTURE_FORMS = ['dry', 'liquid', 'slant', 'culture', 'dregs'] as const;
export const FLOCCULATION = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;

export const cultureDataSchema = z.object({
  name,
  /** Lab / producer, e.g. "Fermentis". */
  producer,
  productId: text(120),
  type: z.enum(CULTURE_TYPES).default('ale'),
  form: z.enum(CULTURE_FORMS).default('dry'),
  attenuationMinPct: pct,
  attenuationMaxPct: pct,
  tempMinC: optNum(-5, 50),
  tempMaxC: optNum(-5, 50),
  flocculation: z.enum(FLOCCULATION).nullable().default(null),
  alcoholTolerancePct: pct,
  bestFor: text(500),
  notes: text(),
});
export type CultureData = z.infer<typeof cultureDataSchema>;

/** Attenuation used for estimates: the middle of the range, or whichever end is known. */
export function cultureAttenuation(c: Pick<CultureData, 'attenuationMinPct' | 'attenuationMaxPct'>): number | null {
  const { attenuationMinPct: lo, attenuationMaxPct: hi } = c;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return hi ?? lo ?? null;
}

// ---- Other ingredients ------------------------------------------------------------------------

export const MISC_TYPES = ['spice', 'fining', 'water_agent', 'herb', 'flavor', 'wood', 'nutrient', 'enzyme', 'other'] as const;
/** How amounts of this ingredient are measured. */
export const AMOUNT_KINDS = ['mass', 'volume', 'count'] as const;
export type AmountKind = (typeof AMOUNT_KINDS)[number];

export const miscDataSchema = z.object({
  name,
  type: z.enum(MISC_TYPES).default('other'),
  producer,
  productId: text(120),
  amountKind: z.enum(AMOUNT_KINDS).default('mass'),
  useFor: text(500),
  notes: text(),
});
export type MiscData = z.infer<typeof miscDataSchema>;

// ---- Water profiles ---------------------------------------------------------------------------

export const WATER_IONS = ['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const;
export type WaterIon = (typeof WATER_IONS)[number];

export const waterDataSchema = z.object({
  name,
  /** source: water you brew with · target: a profile to aim for. */
  role: z.enum(['source', 'target']).default('target'),
  /** All ions in ppm (mg/L). */
  calcium: z.number().min(0).max(2000).default(0),
  magnesium: z.number().min(0).max(1000).default(0),
  sodium: z.number().min(0).max(2000).default(0),
  sulfate: z.number().min(0).max(3000).default(0),
  chloride: z.number().min(0).max(3000).default(0),
  bicarbonate: z.number().min(0).max(3000).default(0),
  ph: optNum(0, 14),
  notes: text(),
});
export type WaterData = z.infer<typeof waterDataSchema>;

// ---- Styles -----------------------------------------------------------------------------------

/** A [min, max] range; either end may be unknown. */
const range = z.tuple([z.number().nullable(), z.number().nullable()]).default([null, null]);
export type Range = [number | null, number | null];

export const styleDataSchema = z.object({
  name,
  /** "BJCP 2015", "BJCP 2021", … */
  guide: text(60),
  category: text(120),
  categoryNumber: text(10),
  styleLetter: text(10),
  type: z.enum(['beer', 'lager', 'ale', 'mixed', 'cider', 'mead', 'wine', 'other']).default('beer'),
  og: range,
  fg: range,
  ibu: range,
  colorEbc: range,
  abvPct: range,
  carbVols: range,
  notes: text(4000),
  profile: text(8000),
  ingredients: text(4000),
  examples: text(2000),
});
export type StyleData = z.infer<typeof styleDataSchema>;

// ---- Items and API -------------------------------------------------------------------------------

export const LIBRARY_SCHEMAS = {
  fermentable: fermentableDataSchema,
  hop: hopDataSchema,
  culture: cultureDataSchema,
  misc: miscDataSchema,
  water: waterDataSchema,
  style: styleDataSchema,
} as const;

export interface LibraryDataMap {
  fermentable: FermentableData;
  hop: HopData;
  culture: CultureData;
  misc: MiscData;
  water: WaterData;
  style: StyleData;
}

export const LIBRARY_SOURCES = ['seed', 'user', 'import'] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];

export interface LibraryItemDto<K extends LibraryKind = LibraryKind> {
  id: string;
  kind: K;
  name: string;
  source: LibrarySource;
  /** Seed items: stable key into the bundled library ("Reset to library value"). */
  seedKey: string | null;
  data: LibraryDataMap[K];
  updatedAt: string;
}

export const libraryListQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>;

/** Values already used, offered in the producer and origin fields (GET /api/library/values). */
export interface LibraryValuesDto {
  /** Producers of the requested kind. */
  producers: string[];
  /** Countries of origin over all kinds. */
  origins: string[];
}

export const libraryValuesQuerySchema = z.object({ kind: z.enum(LIBRARY_KINDS) });

/** Validate library data for a kind (fills defaults). */
export function parseLibraryData<K extends LibraryKind>(kind: K, data: unknown): LibraryDataMap[K] {
  return LIBRARY_SCHEMAS[kind].parse(data) as LibraryDataMap[K];
}

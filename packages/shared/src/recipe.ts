import { z } from 'zod';
import { equipmentDataSchema } from './equipment';
import { recipeWaterSchema } from './water';
import { normalizeOrigin } from './origin';
import {
  AMOUNT_KINDS,
  CULTURE_FORMS,
  CULTURE_TYPES,
  FERMENTABLE_TYPES,
  GRAIN_GROUPS,
  HOP_FORMS,
  MISC_TYPES,
  styleDataSchema,
} from './library';

/**
 * A recipe as one document (shaped like BeerJSON, but in canonical units: kg, L, °C, SG, EBC,
 * minutes, %). Batches carry their own copy of this document, so a batch can be changed without
 * touching the recipe it came from.
 *
 * Ingredient lines hold a copy of the library values they were picked with (`libraryRef` points
 * back to the library item), so later library edits never change a recipe by surprise.
 */

export const RECIPE_DOC_VERSION = 1;

const id = z.string().min(1).max(64);
const ref = z.string().max(64).nullable().default(null);
const name = z.string().trim().min(1).max(120);
const str = (max = 120) => z.string().max(max).default('');
const nullableNum = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);
const producer = z.string().trim().max(120).default('');
const origin = z.string().max(120).transform(normalizeOrigin).default('');

// ---- Ingredient lines --------------------------------------------------------------------------

export const FERMENTABLE_USES = ['mash', 'steep', 'boil', 'fermentation'] as const;
export type FermentableUse = (typeof FERMENTABLE_USES)[number];

export const fermentableLineSchema = z.object({
  id,
  libraryRef: ref,
  name,
  type: z.enum(FERMENTABLE_TYPES).default('grain'),
  grainGroup: z.enum(GRAIN_GROUPS).nullable().default(null),
  producer,
  origin,
  colorEbc: z.number().min(0).max(5000).default(0),
  potentialSg: z.number().min(1).max(1.05).default(1.037),
  fermentability: z.number().min(0).max(1.2).default(1),
  amountKg: z.number().min(0).max(100000).default(0),
  /** mash: converted in the mash (brewhouse efficiency) · steep/boil/fermentation: all extract counts. */
  use: z.enum(FERMENTABLE_USES).default('mash'),
});
export type FermentableLine = z.infer<typeof fermentableLineSchema>;

export const HOP_USES = ['mash', 'first_wort', 'boil', 'whirlpool', 'dry_hop'] as const;
export type HopUse = (typeof HOP_USES)[number];

export const hopLineSchema = z.object({
  id,
  libraryRef: ref,
  name,
  producer,
  origin,
  form: z.enum(HOP_FORMS).default('pellet'),
  alphaPct: z.number().min(0).max(100).default(5),
  betaPct: nullableNum(0, 100),
  amountKg: z.number().min(0).max(10000).default(0),
  use: z.enum(HOP_USES).default('boil'),
  /** boil: minutes before the end of the boil · whirlpool: steeping minutes · others: unused. */
  timeMin: z.number().min(0).max(1000).default(60),
  /** Whirlpool / hop stand temperature. */
  tempC: nullableNum(0, 100),
  /** Dry hop: day of fermentation it goes in (1 = first day). */
  day: nullableNum(0, 365),
  /** Dry hop: days before it comes out / packaging. */
  durationDays: nullableNum(0, 365),
});
export type HopLine = z.infer<typeof hopLineSchema>;

export const cultureLineSchema = z.object({
  id,
  libraryRef: ref,
  name,
  producer,
  productId: str(),
  type: z.enum(CULTURE_TYPES).default('ale'),
  form: z.enum(CULTURE_FORMS).default('dry'),
  /** Apparent attenuation used for the FG estimate. */
  attenuationPct: nullableNum(0, 100),
  tempMinC: nullableNum(-5, 50),
  tempMaxC: nullableNum(-5, 50),
  /** count: packs/vials · mass: kg · volume: L. */
  amountKind: z.enum(AMOUNT_KINDS).default('count'),
  amount: z.number().min(0).max(100000).default(1),
});
export type CultureLine = z.infer<typeof cultureLineSchema>;

export const MISC_USES = ['mash', 'sparge', 'boil', 'whirlpool', 'fermentation', 'packaging'] as const;
export type MiscUse = (typeof MISC_USES)[number];

export const miscLineSchema = z.object({
  id,
  libraryRef: ref,
  name,
  type: z.enum(MISC_TYPES).default('other'),
  producer,
  /** count: items · mass: kg · volume: L. */
  amountKind: z.enum(AMOUNT_KINDS).default('mass'),
  amount: z.number().min(0).max(100000).default(0),
  use: z.enum(MISC_USES).default('boil'),
  /** boil: minutes before the end · fermentation: day added · others: duration in minutes. */
  timeMin: nullableNum(0, 100000),
  notes: str(500),
});
export type MiscLine = z.infer<typeof miscLineSchema>;

// ---- Process ----------------------------------------------------------------------------------

export const MASH_STEP_TYPES = ['infusion', 'temperature', 'decoction'] as const;

export const mashStepSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  type: z.enum(MASH_STEP_TYPES).default('temperature'),
  tempC: z.number().min(0).max(105).default(67),
  timeMin: z.number().min(0).max(1440).default(60),
  rampMin: nullableNum(0, 1440),
  /** Water added in this step (infusion), L. */
  infuseL: nullableNum(0, 100000),
});
export type MashStep = z.infer<typeof mashStepSchema>;

export const mashSchema = z.object({
  name: str(),
  spargeTempC: nullableNum(0, 100),
  steps: z.array(mashStepSchema).max(30).default([]),
});
export type Mash = z.infer<typeof mashSchema>;

export const fermentationStepSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  tempC: z.number().min(-5).max(50).default(19),
  days: z.number().min(0).max(1000).default(7),
  /** Days to reach this step's temperature from the previous one. */
  rampDays: nullableNum(0, 30),
});
export type FermentationStep = z.infer<typeof fermentationStepSchema>;

/** The style the recipe aims for: a copy of the library style's ranges. */
export const recipeStyleSchema = styleDataSchema
  .pick({ name: true, guide: true, category: true, categoryNumber: true, styleLetter: true, og: true, fg: true, ibu: true, colorEbc: true, abvPct: true, carbVols: true })
  .extend({ libraryRef: ref });
export type RecipeStyle = z.infer<typeof recipeStyleSchema>;

/** The brewhouse the recipe is designed for: a copy of the equipment profile. */
export const recipeEquipmentSchema = equipmentDataSchema.extend({ libraryRef: ref });
export type RecipeEquipment = z.infer<typeof recipeEquipmentSchema>;

export const RECIPE_TYPES = ['all_grain', 'partial_mash', 'extract', 'other'] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export const recipeDocSchema = z.object({
  docVersion: z.number().int().default(RECIPE_DOC_VERSION),
  name,
  type: z.enum(RECIPE_TYPES).default('all_grain'),
  author: str(),
  /** Picture / logo of the recipe (id from POST /api/images). Batches copy it with the recipe. */
  image: z.string().max(64).nullable().default(null),
  /** Volume into the fermenter. */
  batchSizeL: z.number().min(0.1).max(100000).default(20),
  boilTimeMin: z.number().min(0).max(600).default(60),
  /** Brewhouse efficiency (share of the malt's potential that reaches the fermenter). */
  efficiencyPct: z.number().min(10).max(100).default(72),
  style: recipeStyleSchema.nullable().default(null),
  equipment: recipeEquipmentSchema.nullable().default(null),
  fermentables: z.array(fermentableLineSchema).max(100).default([]),
  hops: z.array(hopLineSchema).max(100).default([]),
  cultures: z.array(cultureLineSchema).max(20).default([]),
  miscs: z.array(miscLineSchema).max(100).default([]),
  // Factory defaults: zod copies a default only one level deep, so nested arrays would be shared.
  mash: mashSchema.default(() => ({ name: '', spargeTempC: null, steps: [] })),
  fermentation: z.array(fermentationStepSchema).max(30).default([]),
  carbonationVols: nullableNum(0, 10),
  water: recipeWaterSchema.default(() => recipeWaterSchema.parse({})),
  notes: str(20000),
});
export type RecipeDoc = z.infer<typeof recipeDocSchema>;

export const newRecipeDoc = (name: string): RecipeDoc => recipeDocSchema.parse({ name });

// ---- API --------------------------------------------------------------------------------------

/** Values calculated from the document; stored alongside for lists and search. */
export interface RecipeStats {
  og: number;
  fg: number;
  abvPct: number;
  ibu: number;
  colorEbc: number;
}

export interface RecipeSummaryDto extends RecipeStats {
  id: string;
  name: string;
  image: string | null;
  styleName: string | null;
  type: RecipeType;
  batchSizeL: number;
  updatedAt: string;
}

export interface RecipeDto {
  id: string;
  doc: RecipeDoc;
  /** Optimistic concurrency: send back with saves, bumped by each save. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const createRecipeSchema = z.object({ doc: recipeDocSchema });
export const updateRecipeSchema = z.object({ doc: recipeDocSchema, version: z.number().int().min(1) });
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export const recipeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

import { z } from 'zod';
import type { AmountKind } from './library';

/** Salts and acids for adjusting brewing water. Chemistry lives in @brew/brewcalc (water.ts). */
export const WATER_AGENTS = [
  'gypsum',
  'calcium_chloride',
  'epsom',
  'magnesium_chloride',
  'table_salt',
  'baking_soda',
  'chalk',
  'lactic_acid',
  'phosphoric_acid',
] as const;
export type WaterAgent = (typeof WATER_AGENTS)[number];

export interface WaterAgentInfo {
  /** Salts are weighed (kg canonical, shown in g); acids are measured by volume (L, shown in ml). */
  amountKind: Extract<AmountKind, 'mass' | 'volume'>;
  /** Seed library item of this agent (links recipes and inventory). */
  seedKey: string;
  /** Lower-case words that identify it in ingredient and inventory names. */
  keywords: string[];
}

export const WATER_AGENT_INFO: Record<WaterAgent, WaterAgentInfo> = {
  gypsum: { amountKind: 'mass', seedKey: 'misc:gypsum', keywords: ['gypsum', 'calcium sulfate', 'calcium sulphate', 'caso4', 'gips', 'calciumsulfat'] },
  calcium_chloride: { amountKind: 'mass', seedKey: 'misc:calcium-chloride', keywords: ['calcium chloride', 'cacl2', 'calciumchlorid'] },
  epsom: { amountKind: 'mass', seedKey: 'misc:epsom-salt', keywords: ['epsom', 'magnesium sulfate', 'magnesium sulphate', 'mgso4', 'bittersalz', 'magnesiumsulfat'] },
  magnesium_chloride: { amountKind: 'mass', seedKey: 'misc:magnesium-chloride', keywords: ['magnesium chloride', 'mgcl2', 'magnesiumchlorid'] },
  table_salt: { amountKind: 'mass', seedKey: 'misc:table-salt', keywords: ['table salt', 'sodium chloride', 'nacl', 'kochsalz', 'non-iodized salt'] },
  baking_soda: { amountKind: 'mass', seedKey: 'misc:baking-soda', keywords: ['baking soda', 'sodium bicarbonate', 'nahco3', 'natron', 'natriumhydrogencarbonat'] },
  chalk: { amountKind: 'mass', seedKey: 'misc:chalk', keywords: ['chalk', 'calcium carbonate', 'caco3', 'kreide', 'calciumcarbonat'] },
  lactic_acid: { amountKind: 'volume', seedKey: 'misc:lactic-acid-80', keywords: ['lactic', 'milchsäure', 'milchsaeure'] },
  phosphoric_acid: { amountKind: 'volume', seedKey: 'misc:phosphoric-acid-10', keywords: ['phosphoric', 'phosphorsäure', 'phosphorsaeure'] },
};

/** The water agent an ingredient name refers to, if any. */
export function waterAgentOf(name: string): WaterAgent | null {
  const n = name.toLowerCase();
  return WATER_AGENTS.find((a) => WATER_AGENT_INFO[a].keywords.some((k) => n.includes(k))) ?? null;
}

const id = z.string().min(1).max(64);
const ppm = z.number().min(0).max(3000);

/** A copy of a water profile's ions (ppm), like style snapshots. */
export const waterSnapshotSchema = z.object({
  libraryRef: z.string().max(64).nullable().default(null),
  name: z.string().trim().min(1).max(120),
  calcium: ppm.default(0),
  magnesium: ppm.default(0),
  sodium: ppm.default(0),
  sulfate: ppm.default(0),
  chloride: ppm.default(0),
  bicarbonate: ppm.default(0),
});
export type WaterSnapshot = z.infer<typeof waterSnapshotSchema>;

export const WATER_ADDITION_PLACES = ['mash', 'sparge'] as const;

export const waterAdditionSchema = z.object({
  id,
  agent: z.enum(WATER_AGENTS),
  /** kg for salts, L for acids (see WATER_AGENT_INFO). */
  amount: z.number().min(0).max(100),
  where: z.enum(WATER_ADDITION_PLACES).default('mash'),
});
export type WaterAddition = z.infer<typeof waterAdditionSchema>;

/** The water plan of a recipe: which water, what target, which additions. */
export const recipeWaterSchema = z.object({
  /** Legacy references (kept for documents saved before the snapshots). */
  sourceRef: z.string().max(64).nullable().default(null),
  targetRef: z.string().max(64).nullable().default(null),
  source: waterSnapshotSchema.nullable().default(null),
  target: waterSnapshotSchema.nullable().default(null),
  /** Share of distilled / RO water mixed into the source water (%). */
  dilutionPct: z.number().min(0).max(100).default(0),
  additions: z.array(waterAdditionSchema).max(30).default([]),
  mashPhTarget: z.number().min(4.5).max(6.5).default(5.4),
});
export type RecipeWater = z.infer<typeof recipeWaterSchema>;

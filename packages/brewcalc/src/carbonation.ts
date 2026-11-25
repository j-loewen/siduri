import type { BatchCarbonation, CarbonationMethod, RecipeDoc } from '@brew/shared';

/** Carbonation used when neither the recipe nor its style gives one (vols CO2). */
export const DEFAULT_CARBONATION_VOLS = 2.4;
/** Keg temperature assumed for force carbonation when the recipe sets none. */
export const DEFAULT_KEG_TEMP_C = 4;
/** Beer temperature assumed for priming when the recipe has no fermentation steps. */
export const DEFAULT_PRIMING_TEMP_C = 20;

/**
 * Table sugar (sucrose) that raises 1 L of beer by 1 volume of CO2, in grams. Fully fermented,
 * 1 g of sucrose gives 0.514 g of CO2 and 1 volume is 1.976 g/L (3.84 g/L); the usual rule of
 * thumb rounds this up to 4 g/L, since not quite all of it ends up dissolved.
 */
export const SUCROSE_G_PER_L_PER_VOL = 4;

/** Kegs need about half the sugar of bottles (BeerXML's keg priming factor). */
export const KEG_PRIMING_FACTOR = 0.5;

export const PRIMING_SUGARS = ['sucrose', 'dextrose', 'dme'] as const;
export type PrimingSugar = (typeof PRIMING_SUGARS)[number];

/**
 * How much CO2 a sugar gives compared with table sugar. Corn sugar is dextrose monohydrate (9 %
 * water); dry malt extract is about 70 % fermentable.
 */
export const PRIMING_SUGAR_EQUIVALENCE: Record<PrimingSugar, number> = {
  sucrose: 1,
  dextrose: 0.91,
  dme: 0.68,
};

const toF = (c: number) => (c * 9) / 5 + 32;
const PSI_TO_BAR = 0.0689475729;

/**
 * CO2 still dissolved in fermented beer (vols): it depends on the warmest temperature the beer
 * reached after fermentation, since warm beer loses CO2 and doesn't take it back when cooled.
 */
export function residualCo2(tempC: number): number {
  const f = toF(Math.min(35, Math.max(-2, tempC)));
  return Math.max(0, 3.0378 - 0.050062 * f + 0.00026555 * f * f);
}

/**
 * Priming sugar for bottles or a keg, in kg. 0 when the beer already holds the target
 * carbonation at that temperature.
 */
export function primingSugarKg(opts: { targetVols: number; beerTempC: number; volumeL: number; sugar?: PrimingSugar; keg?: boolean }): number {
  const missing = Math.max(0, opts.targetVols - residualCo2(opts.beerTempC));
  const sucroseG = missing * SUCROSE_G_PER_L_PER_VOL * Math.max(0, opts.volumeL) * (opts.keg ? KEG_PRIMING_FACTOR : 1);
  return sucroseG / PRIMING_SUGAR_EQUIVALENCE[opts.sugar ?? 'sucrose'] / 1000;
}

/**
 * Gauge pressure (bar) that carbonates beer at this temperature to the target, set and left
 * until the beer has taken up the CO2 (equilibrium chart fit, in psi and °F).
 */
export function forceCarbonationBar(targetVols: number, tempC: number): number {
  const f = toF(tempC);
  const v = targetVols;
  const psi = -16.6999 - 0.0101059 * f + 0.00116512 * f * f + 0.173354 * f * v + 4.24267 * v - 0.0684226 * v * v;
  return Math.max(0, psi * PSI_TO_BAR);
}

/** Days a keg left at the equilibrium pressure needs to reach it (rough, a typical 19 L keg). */
export const FORCE_CARBONATION_DAYS: [number, number] = [7, 10];

/** The carbonation the recipe aims for: its own value, else the low end of its style, else 2.4. */
export function recipeCarbonation(doc: Pick<RecipeDoc, 'carbonationVols' | 'style'>): number {
  return doc.carbonationVols ?? doc.style?.carbVols[0] ?? DEFAULT_CARBONATION_VOLS;
}

/**
 * The temperature the carbonation is worked out for, unless the batch sets one: for sugar the
 * warmest fermentation step, for force carbonation a cold keg.
 */
export function defaultCarbonationTemp(method: CarbonationMethod, fermentation: RecipeDoc['fermentation']): number {
  if (method === 'keg_force') return DEFAULT_KEG_TEMP_C;
  return fermentation.length ? Math.max(...fermentation.map((s) => s.tempC)) : DEFAULT_PRIMING_TEMP_C;
}

export type CarbonationPlan =
  | { method: 'bottle' | 'keg_sugar'; targetVols: number; tempC: number; volumeL: number; residualVols: number; sugarKg: Record<PrimingSugar, number> }
  | { method: 'keg_force'; targetVols: number; tempC: number; pressureBar: number; days: [number, number] };

/**
 * What to do to carbonate a batch: its settings (null values fall back to the recipe document)
 * for `volumeL` of packaged beer.
 */
export function carbonationPlan(
  settings: BatchCarbonation,
  doc: Pick<RecipeDoc, 'carbonationVols' | 'style' | 'fermentation'>,
  volumeL: number,
): CarbonationPlan {
  const method = settings.method;
  const targetVols = settings.vols ?? recipeCarbonation(doc);
  const tempC = settings.tempC ?? defaultCarbonationTemp(method, doc.fermentation);
  if (method === 'keg_force') return { method, targetVols, tempC, pressureBar: forceCarbonationBar(targetVols, tempC), days: FORCE_CARBONATION_DAYS };
  const keg = method === 'keg_sugar';
  const sugarKg = Object.fromEntries(PRIMING_SUGARS.map((sugar) => [sugar, primingSugarKg({ targetVols, beerTempC: tempC, volumeL, sugar, keg })])) as Record<PrimingSugar, number>;
  return { method, targetVols, tempC, volumeL, residualVols: residualCo2(tempC), sugarKg };
}

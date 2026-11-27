import { platoToSg, sgToPlato } from '@brew/shared';

/** Gravity points: 1.050 → 50. */
export const points = (sg: number) => (sg - 1) * 1000;
export const fromPoints = (pts: number) => 1 + pts / 1000;

/** Extract potential as points per pound per US gallon (PPG). */
export const ppg = (potentialSg: number) => points(potentialSg);

/**
 * Gravity points one kilogram of a fermentable adds to one litre, at 100% efficiency.
 * 1 lb/gal = 119.826 g/L, so points = PPG × (g/L) / 119.826.
 */
export const pointsPerKgPerL = (potentialSg: number) => (ppg(potentialSg) * 1000) / 119.826;

// A gravity above the original one (a wrong reading or OG) gives 0, never negative alcohol.

/** Standard ABV estimate (%). */
export const abvSimple = (og: number, fg: number) => Math.max(0, (og - fg) * 131.25);

/** ABV estimate that stays accurate for strong beers (%). */
export const abvAdvanced = (og: number, fg: number) => Math.max(0, ((76.08 * (og - fg)) / (1.775 - og)) * (fg / 0.794));

/** Apparent attenuation (%) between two gravities; above 100 when the beer ends below 1.000. */
export const apparentAttenuation = (og: number, gravity: number) => (og > 1 ? Math.max(0, (100 * (og - gravity)) / (og - 1)) : 0);

/** Real extract based attenuation (%) — what the yeast actually fermented. */
export function realAttenuation(og: number, fg: number): number {
  const oe = sgToPlato(og);
  const ae = sgToPlato(fg);
  const re = 0.1808 * oe + 0.8192 * ae;
  return oe > 0 ? Math.max(0, (100 * (oe - re)) / oe) : 0;
}

/**
 * Hydrometer reading corrected to its calibration temperature (all °C).
 * Polynomial in °F from the classic correction table (accurate from ~0–60 °C).
 */
export function hydrometerCorrection(sg: number, sampleTempC: number, calibrationTempC = 20): number {
  const f = (c: number) => (c * 9) / 5 + 32;
  const d = (t: number) => 1.00130346 - 0.000134722124 * t + 0.00000204052596 * t ** 2 - 0.00000000232820948 * t ** 3;
  return sg * (d(f(sampleTempC)) / d(f(calibrationTempC)));
}

/**
 * Refractometer: specific gravity from a °Brix reading.
 * Without `originalBrix` the wort is unfermented: plain Brix → SG with the wort correction factor.
 * With it, the reading is of fermenting wort and alcohol is corrected for (Sean Terrill, cubic).
 */
export function refractometerToSg(brix: number, opts: { wcf?: number; originalBrix?: number } = {}): number {
  const wcf = opts.wcf ?? 1.04;
  const bi = opts.originalBrix;
  if (bi === undefined) return platoToSg(brix / wcf);
  const ri = bi / wcf;
  const rf = brix / wcf;
  return 1 - 0.0044993 * ri + 0.011774 * rf + 0.00027581 * ri ** 2 - 0.0012717 * rf ** 2 - 0.0000072800 * ri ** 3 + 0.000063293 * rf ** 3;
}

/** Water (L) to add to reach a target gravity, or a negative value if more extract is needed. */
export function dilutionToTarget(currentSg: number, volumeL: number, targetSg: number): number {
  if (targetSg <= 1) return 0;
  return (volumeL * points(currentSg)) / points(targetSg) - volumeL;
}

/** Extract (kg) of a fermentable with this potential to raise a volume to a target gravity. */
export function extractToTarget(currentSg: number, volumeL: number, targetSg: number, potentialSg = 1.044): number {
  const missing = points(targetSg) - points(currentSg);
  if (missing <= 0) return 0;
  return (missing * volumeL) / pointsPerKgPerL(potentialSg);
}

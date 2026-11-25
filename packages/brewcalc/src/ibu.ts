import type { HopLine } from '@brew/shared';

/** Tinseth's "bigness factor": high-gravity wort extracts less bitterness. */
export const bigness = (gravity: number) => 1.65 * 0.000125 ** (gravity - 1);

/** Tinseth's boil time factor (minutes). */
export const boilTimeFactor = (minutes: number) => (1 - Math.exp(-0.04 * minutes)) / 4.15;

/**
 * Relative alpha-acid isomerisation rate at a temperature (1 ≈ boiling), after Malowicki.
 * Used for whirlpool / hop stand additions.
 */
export const isomerisationRate = (tempC: number) => 2.39e11 * Math.exp(-9773 / (tempC + 273.15));

/** Default hop stand temperature when none is given. */
export const DEFAULT_WHIRLPOOL_C = 80;

/** Share of a boil addition's bitterness a first-wort / mash addition gets. */
const FIRST_WORT_FACTOR = 1.1;
const MASH_HOP_FACTOR = 0.2;

/**
 * Utilization (Tinseth) of one hop addition: the share of its alpha acids that ends up as IBU.
 * `boilTimeMin` is the recipe's boil length (first-wort and mash hops boil for all of it).
 */
export function hopUtilization(hop: Pick<HopLine, 'use' | 'timeMin' | 'tempC'>, gravity: number, boilTimeMin: number): number {
  const b = bigness(gravity);
  switch (hop.use) {
    case 'boil':
      return b * boilTimeFactor(Math.min(hop.timeMin, boilTimeMin || hop.timeMin));
    case 'first_wort':
      return b * boilTimeFactor(boilTimeMin) * FIRST_WORT_FACTOR;
    case 'mash':
      return b * boilTimeFactor(boilTimeMin) * MASH_HOP_FACTOR;
    case 'whirlpool': {
      const rate = isomerisationRate(hop.tempC ?? DEFAULT_WHIRLPOOL_C);
      return (b * (1 - Math.exp(-0.04 * hop.timeMin * rate))) / 4.15;
    }
    case 'dry_hop':
      return 0;
  }
}

/**
 * IBU of one addition (Tinseth). `volumeL` is the wort volume after the boil; `utilizationPct`
 * is the equipment's correction (100 = none).
 */
export function hopIbu(
  hop: Pick<HopLine, 'use' | 'timeMin' | 'tempC' | 'alphaPct' | 'amountKg'>,
  opts: { gravity: number; volumeL: number; boilTimeMin: number; utilizationPct?: number },
): number {
  if (opts.volumeL <= 0) return 0;
  const alphaMgPerL = ((hop.alphaPct / 100) * hop.amountKg * 1e6) / opts.volumeL;
  return hopUtilization(hop, opts.gravity, opts.boilTimeMin) * alphaMgPerL * ((opts.utilizationPct ?? 100) / 100);
}

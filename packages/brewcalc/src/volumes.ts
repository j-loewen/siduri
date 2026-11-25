import type { EquipmentData } from '@brew/shared';

/** Volume grain takes up in the mash, L per kg (for "will it fit in my tun"). */
export const GRAIN_DISPLACEMENT_L_PER_KG = 0.67;
/** Specific heat of grain relative to water. */
const GRAIN_SPECIFIC_HEAT = 0.41;

export interface BrewVolumes {
  /** Into the fermenter (the recipe's batch size). */
  fermenterL: number;
  /** Packaged beer after fermenter losses. */
  packagedL: number;
  /** Cooled wort at the end of the boil. */
  postBoilL: number;
  /** Hot wort at the end of the boil (what the kettle shows). */
  postBoilHotL: number;
  /** Hot wort at the start of the boil. */
  preBoilL: number;
  /** Water absorbed by the grain. */
  absorptionL: number;
  totalWaterL: number;
  strikeL: number;
  spargeL: number;
  /** Grain plus strike water: how full the mash tun gets. */
  mashVolumeL: number;
  mashGrainKg: number;
  /** Mash thickness actually used (L/kg). */
  mashThicknessLPerKg: number | null;
  boilOffL: number;
  topUpL: number;
}

/**
 * Water and wort volumes for a brew day, working backwards from the volume into the fermenter
 * through the equipment's losses.
 */
export function brewVolumes(
  eq: EquipmentData,
  opts: { batchSizeL: number; boilTimeMin: number; mashGrainKg: number },
): BrewVolumes {
  const fermenterL = opts.batchSizeL;
  const topUpL = Math.min(eq.topUpWaterL, fermenterL);
  const postBoilL = Math.max(0, fermenterL + eq.kettleLossL - topUpL);
  const postBoilHotL = postBoilL / (1 - eq.coolingShrinkagePct / 100);
  const boilOffL = (eq.boilOffLPerH * opts.boilTimeMin) / 60;
  const preBoilL = postBoilHotL + boilOffL;
  const grain = opts.mashGrainKg;
  const extract = eq.method === 'extract' || grain <= 0;
  const absorptionL = extract ? 0 : grain * eq.grainAbsorptionLPerKg;
  // Water is measured cold; the pre-boil volume is hot wort, expanded by the cooling shrinkage.
  const preBoilColdL = preBoilL * (1 - eq.coolingShrinkagePct / 100);
  const totalWaterL = extract ? preBoilColdL : preBoilColdL + absorptionL + eq.mashTunDeadspaceL;
  let strikeL: number;
  if (extract) strikeL = 0;
  // The water below the false bottom / malt pipe comes on top of the water-to-grain ratio.
  else if (eq.method === 'mash_sparge') strikeL = Math.min(totalWaterL, grain * eq.mashThicknessLPerKg + eq.mashTunRecoverableL);
  else strikeL = totalWaterL;
  const spargeL = extract ? 0 : Math.max(0, totalWaterL - strikeL);
  return {
    fermenterL,
    packagedL: Math.max(0, fermenterL - eq.fermenterLossL),
    postBoilL,
    postBoilHotL,
    preBoilL,
    absorptionL,
    totalWaterL,
    strikeL,
    spargeL,
    mashVolumeL: extract ? 0 : strikeL + grain * GRAIN_DISPLACEMENT_L_PER_KG,
    mashGrainKg: grain,
    mashThicknessLPerKg: grain > 0 && !extract ? strikeL / grain : null,
    boilOffL,
    topUpL,
  };
}

/** A vessel of the equipment that is too small for the brew. */
export interface FitIssue {
  /** mashTun: grain and strike water · kettle: wort at the start of the boil · fermenter: the batch. */
  vessel: 'mashTun' | 'kettle' | 'fermenter';
  /** tooSmall: it doesn't fit · littleHeadspace: it fits, but leaves too little room for the krausen. */
  problem: 'tooSmall' | 'littleHeadspace';
  /** How much has to go in, L. */
  needL: number;
  /** What the vessel holds, L. */
  capacityL: number;
}

/**
 * Free room a fermenter should have above the wort, % of its volume: the krausen of an active
 * fermentation easily rises this much (more for wheat beers and warm ales).
 */
export const MIN_HEADSPACE_PCT = 15;

// A little tolerance, so rounding doesn't warn about a vessel filled exactly to the brim.
const tooSmall = (capacity: number | null | undefined, need: number): capacity is number => capacity != null && capacity > 0 && need > capacity + 0.05;

/** Whether `batchL` fits a fermenter of `capacityL`, with room for the krausen. Null: fine, or the size is unknown. */
export function fermenterFit(batchL: number, capacityL: number | null | undefined): FitIssue['problem'] | null {
  if (capacityL == null || capacityL <= 0 || batchL <= 0) return null;
  if (tooSmall(capacityL, batchL)) return 'tooSmall';
  return (capacityL - batchL) / capacityL < MIN_HEADSPACE_PCT / 100 ? 'littleHeadspace' : null;
}

/**
 * Checks that the mash, the boil and the batch fit the equipment. Without a mash tun size,
 * brew-in-a-bag and no-sparge brews are taken to mash in the kettle. `fermenterL` is the size of
 * the batch's own fermenter (otherwise the equipment's). Vessels without a size are not checked.
 */
export function equipmentFit(eq: EquipmentData | null | undefined, v: BrewVolumes, fermenterL?: number | null): FitIssue[] {
  const issues: FitIssue[] = [];
  if (eq) {
    const mashVessel = eq.mashTunVolumeL ?? (eq.method === 'biab' || eq.method === 'no_sparge' ? eq.kettleVolumeL : null);
    if (tooSmall(mashVessel, v.mashVolumeL)) issues.push({ vessel: 'mashTun', problem: 'tooSmall', needL: v.mashVolumeL, capacityL: mashVessel });
    if (tooSmall(eq.kettleVolumeL, v.preBoilL)) issues.push({ vessel: 'kettle', problem: 'tooSmall', needL: v.preBoilL, capacityL: eq.kettleVolumeL });
  }
  const fermenter = fermenterL ?? eq?.fermenterVolumeL;
  const problem = fermenterFit(v.fermenterL, fermenter);
  if (problem) issues.push({ vessel: 'fermenter', problem, needL: v.fermenterL, capacityL: fermenter! });
  return issues;
}

/**
 * Temperature (°C) to heat strike water to, so grain at `grainTempC` mixed in at
 * `thicknessLPerKg` settles at `targetC`.
 */
export function strikeTemperature(targetC: number, grainTempC: number, thicknessLPerKg: number): number {
  if (thicknessLPerKg <= 0) return targetC;
  return targetC + (GRAIN_SPECIFIC_HEAT * (targetC - grainTempC)) / thicknessLPerKg;
}

/**
 * Boiling water (L) to add to a mash to raise it from `fromC` to `toC`
 * (infusion step; `waterL` is the water already in the mash).
 */
export function infusionVolume(fromC: number, toC: number, grainKg: number, waterL: number, infusionC = 100): number {
  if (toC >= infusionC) return Infinity;
  return ((toC - fromC) * (GRAIN_SPECIFIC_HEAT * grainKg + waterL)) / (infusionC - toC);
}

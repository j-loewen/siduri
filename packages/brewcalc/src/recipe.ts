import { DEFAULT_EQUIPMENT, type RecipeDoc, type RecipeStats } from '@brew/shared';
import { beerColorHex, moreyEbc } from './color';
import { abvSimple, fromPoints, points, pointsPerKgPerL } from './gravity';
import { hopIbu } from './ibu';
import { brewVolumes, strikeTemperature, type BrewVolumes } from './volumes';

/** Attenuation assumed when the recipe has no yeast with a known attenuation. */
export const DEFAULT_ATTENUATION_PCT = 75;

export interface FermentableShare {
  id: string;
  /** Share of the grist by weight (%). */
  pct: number;
  /** Gravity points this addition contributes to the OG. */
  points: number;
}

export interface HopContribution {
  id: string;
  ibu: number;
}

export interface RecipeCalc extends RecipeStats {
  /** Bitterness to gravity ratio (BU:GU). */
  buGu: number;
  preBoilGravity: number;
  colorHex: string;
  attenuationPct: number;
  totalFermentableKg: number;
  totalHopKg: number;
  fermentables: FermentableShare[];
  hops: HopContribution[];
  volumes: BrewVolumes;
  /** Strike water temperature for the first mash step, if there is one. */
  strikeTempC: number | null;
}

/** Everything the recipe editor and the brew day show, calculated from the document. */
export function calculateRecipe(doc: RecipeDoc): RecipeCalc {
  const eq = doc.equipment ?? DEFAULT_EQUIPMENT;
  const batchL = doc.batchSizeL;
  const efficiency = doc.efficiencyPct / 100;

  // ---- Gravity in the fermenter: brewhouse efficiency for mashed/steeped grain, all extract otherwise
  let ogPoints = 0;
  let fermentablePoints = 0;
  let kettlePoints = 0;
  let totalKg = 0;
  let mashKg = 0;
  const shares: FermentableShare[] = [];
  for (const f of doc.fermentables) {
    const eff = f.use === 'mash' || f.use === 'steep' ? efficiency : 1;
    const pts = batchL > 0 ? (pointsPerKgPerL(f.potentialSg) * f.amountKg * eff) / batchL : 0;
    ogPoints += pts;
    fermentablePoints += pts * Math.min(1, f.fermentability);
    if (f.use !== 'fermentation') kettlePoints += pts;
    totalKg += f.amountKg;
    if (f.use === 'mash') mashKg += f.amountKg;
    shares.push({ id: f.id, pct: 0, points: pts });
  }
  doc.fermentables.forEach((f, i) => {
    shares[i]!.pct = totalKg > 0 ? (100 * f.amountKg) / totalKg : 0;
  });
  const og = fromPoints(ogPoints);

  const known = doc.cultures.map((c) => c.attenuationPct).filter((a): a is number => a != null);
  const attenuationPct = known.length ? Math.max(...known) : DEFAULT_ATTENUATION_PCT;
  const fg = fromPoints(ogPoints - fermentablePoints * (attenuationPct / 100));

  // ---- Volumes: the equipment's losses, with the recipe's batch size and boil time
  const volumes = brewVolumes(eq, { batchSizeL: batchL, boilTimeMin: doc.boilTimeMin, mashGrainKg: mashKg });
  // Wort that goes from the kettle into the fermenter (the rest of the fermenter is top-up water).
  const transferredL = Math.max(0.001, batchL - volumes.topUpL);
  // Extract in the kettle (point-litres), including what stays behind in the kettle losses.
  const kettleExtract = ((kettlePoints * batchL) / transferredL) * volumes.postBoilL;
  const coldPreBoilL = volumes.preBoilL * (1 - eq.coolingShrinkagePct / 100);
  const preBoilGravity = coldPreBoilL > 0 ? fromPoints(kettleExtract / coldPreBoilL) : og;
  const postBoilGravity = volumes.postBoilL > 0 ? fromPoints(kettleExtract / volumes.postBoilL) : og;

  // ---- Bitterness (Tinseth) in the wort at the end of the boil, diluted by any top-up water
  const ibuVolume = doc.equipment ? volumes.postBoilL : batchL;
  const dilution = doc.equipment ? transferredL / batchL : 1;
  const hops = doc.hops.map((h) => ({
    id: h.id,
    ibu:
      hopIbu(h, {
        gravity: doc.equipment ? postBoilGravity : og,
        volumeL: ibuVolume,
        boilTimeMin: doc.boilTimeMin,
        utilizationPct: eq.hopUtilizationPct,
      }) * dilution,
  }));
  const ibu = hops.reduce((sum, h) => sum + h.ibu, 0);

  // ---- Colour (Morey) of the beer in the fermenter
  // In the wort at the end of the boil (batch size + kettle losses), as Brewfather calculates it.
  const colorEbc = moreyEbc(doc.fermentables, batchL + eq.kettleLossL);

  const firstStep = doc.mash.steps[0];
  const strikeTempC =
    firstStep && volumes.mashThicknessLPerKg ? strikeTemperature(firstStep.tempC, eq.grainTempC, volumes.mashThicknessLPerKg) : null;

  return {
    og,
    fg,
    abvPct: abvSimple(og, fg),
    ibu,
    colorEbc,
    buGu: ogPoints > 0 ? ibu / points(og) : 0,
    preBoilGravity,
    colorHex: beerColorHex(colorEbc),
    attenuationPct,
    totalFermentableKg: totalKg,
    totalHopKg: doc.hops.reduce((s, h) => s + h.amountKg, 0),
    fermentables: shares,
    hops,
    volumes,
    strikeTempC,
  };
}

/** The stats stored with a recipe for lists and search. */
export function recipeStats(doc: RecipeDoc): RecipeStats {
  const c = calculateRecipe(doc);
  return { og: c.og, fg: c.fg, abvPct: c.abvPct, ibu: c.ibu, colorEbc: c.colorEbc };
}

/**
 * Scale a recipe to a new batch size (and optionally a new efficiency), keeping OG, IBU and colour.
 * Mashed fermentables scale with volume and efficiency; everything else with volume only.
 */
export function scaleRecipe(doc: RecipeDoc, batchSizeL: number, efficiencyPct = doc.efficiencyPct): RecipeDoc {
  const v = batchSizeL / doc.batchSizeL;
  const e = doc.efficiencyPct / efficiencyPct;
  return {
    ...doc,
    batchSizeL,
    efficiencyPct,
    fermentables: doc.fermentables.map((f) => ({
      ...f,
      amountKg: f.amountKg * v * (f.use === 'mash' || f.use === 'steep' ? e : 1),
    })),
    hops: doc.hops.map((h) => ({ ...h, amountKg: h.amountKg * v })),
    miscs: doc.miscs.map((m) => ({ ...m, amount: m.amountKind === 'count' ? m.amount : m.amount * v })),
    mash: { ...doc.mash, steps: doc.mash.steps.map((s) => ({ ...s, infuseL: s.infuseL == null ? null : s.infuseL * v })) },
  };
}

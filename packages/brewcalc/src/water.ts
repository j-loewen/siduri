import {
  ebcToSrm,
  srmToLovibond,
  waterAgentOf,
  WATER_AGENT_INFO,
  WATER_IONS,
  type RecipeDoc,
  type WaterAgent,
  type WaterIon,
  type WaterSnapshot,
} from '@brew/shared';
import type { RecipeCalc } from './recipe';

/**
 * Brewing water chemistry: what salts and acids add, how mash and sparge water mix, residual
 * alkalinity, an estimated mash pH, and suggested additions to reach a target profile.
 */

export type Ions = Record<WaterIon, number>;
export const ZERO_IONS: Ions = { calcium: 0, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 };

/**
 * ppm each ion changes by per gram of salt per litre (acids: per millilitre per litre). From the
 * molar masses of the hydrated salts. Acids neutralise bicarbonate: lactic acid 80 % is
 * ~10.7 mmol/ml, phosphoric acid 10 % ~1.07 mmol/ml (first proton at mash pH).
 */
export const AGENT_PPM: Record<WaterAgent, Partial<Ions>> = {
  gypsum: { calcium: 232.8, sulfate: 557.9 }, // CaSO4·2H2O
  calcium_chloride: { calcium: 272.6, chloride: 482.3 }, // CaCl2·2H2O
  epsom: { magnesium: 98.6, sulfate: 389.7 }, // MgSO4·7H2O
  magnesium_chloride: { magnesium: 119.5, chloride: 348.7 }, // MgCl2·6H2O
  table_salt: { sodium: 393.4, chloride: 606.6 }, // NaCl
  baking_soda: { sodium: 273.7, bicarbonate: 726.3 }, // NaHCO3
  chalk: { calcium: 400.4, bicarbonate: 1219.3 }, // CaCO3, dissolved with CO2 (only partly in practice)
  lactic_acid: { bicarbonate: -650.5 },
  phosphoric_acid: { bicarbonate: -65.4 },
};

/** Acid strength (mmol of H+ per ml) used for the "acid for target pH" suggestion. */
const ACID_MMOL_PER_ML = { lactic_acid: 10.66, phosphoric_acid: 1.07 } as const;

export const ionsOf = (w: WaterSnapshot | null | undefined): Ions =>
  w ? { calcium: w.calcium, magnesium: w.magnesium, sodium: w.sodium, sulfate: w.sulfate, chloride: w.chloride, bicarbonate: w.bicarbonate } : { ...ZERO_IONS };

/** Source water mixed with a share of distilled / RO water. */
export function dilute(ions: Ions, dilutionPct: number): Ions {
  const f = 1 - dilutionPct / 100;
  return Object.fromEntries(WATER_IONS.map((k) => [k, ions[k] * f])) as Ions;
}

/** Ions after dissolving agents in a volume. Amounts canonical: kg (salts) or L (acids). */
export function addAgents(base: Ions, additions: { agent: WaterAgent; amount: number }[], volumeL: number): Ions {
  const out = { ...base };
  if (volumeL <= 0) return out;
  for (const a of additions) {
    const perLitre = (a.amount * 1000) / volumeL; // g/L or ml/L
    for (const [ion, ppm] of Object.entries(AGENT_PPM[a.agent]) as [WaterIon, number][]) out[ion] += ppm * perLitre;
  }
  return out;
}

/** Alkalinity as CaCO3 (ppm) from bicarbonate. Negative = acid beyond all alkalinity. */
export const alkalinity = (ions: Ions) => (ions.bicarbonate * 50) / 61.02;

/** Residual alkalinity (ppm as CaCO3): alkalinity left after calcium and magnesium react. */
export const residualAlkalinity = (ions: Ions) => alkalinity(ions) - ions.calcium / 3.5 - ions.magnesium / 7;

export const sulfateChlorideRatio = (ions: Ions) => (ions.chloride > 0 ? ions.sulfate / ions.chloride : null);

// ---- Mash pH (estimate) --------------------------------------------------------------------------------

/**
 * pH of a malt mashed in distilled water, by type and colour (after Troester's measurements, as
 * used by EZ Water): base malts ~5.7–5.8 getting lower with colour, crystal 5.22 − 0.00504·°L,
 * roasted ~4.7, unmalted adjuncts ~5.9.
 */
export function distilledWaterPh(f: RecipeDoc['fermentables'][number]): number {
  const lovibond = Math.max(0, srmToLovibond(ebcToSrm(f.colorEbc)));
  if (f.grainGroup === 'roasted' || lovibond > 200) return 4.71;
  if (f.grainGroup === 'caramel') return 5.22 - 0.00504 * lovibond;
  if (f.grainGroup === 'adjunct' || f.type === 'adjunct') return 5.9;
  if (lovibond <= 20) return 5.82 - 0.035 * lovibond;
  return 5.22 - 0.00504 * lovibond;
}

const isAcidMalt = (f: RecipeDoc['fermentables'][number]) => /acid|sauer/i.test(f.name);

/** Estimated mash pH, or null without mashed grain. Accuracy about ±0.1–0.2. */
export function estimateMashPh(doc: RecipeDoc, mashIons: Ions, thicknessLPerKg: number): number | null {
  const mashed = doc.fermentables.filter((f) => f.use === 'mash' && f.amountKg > 0);
  const total = mashed.reduce((s, f) => s + f.amountKg, 0);
  if (total <= 0) return null;
  const regular = mashed.filter((f) => !isAcidMalt(f));
  const regularKg = regular.reduce((s, f) => s + f.amountKg, 0);
  const acidMaltPct = (100 * (total - regularKg)) / total;
  const distilled = regularKg > 0 ? regular.reduce((s, f) => s + distilledWaterPh(f) * f.amountKg, 0) / regularKg : 5.7;
  const thicknessQtPerLb = thicknessLPerKg / 2.086;
  // EZ Water: pH shift per 50 ppm RA grows with mash thickness; acid malt ~ −0.1 pH per %.
  return distilled + ((0.1085 * thicknessQtPerLb + 0.013) * residualAlkalinity(mashIons)) / 50 - 0.1 * acidMaltPct;
}

/**
 * Acid to add to the mash (L) to bring the estimated mash pH to `target`, or 0 when it is
 * already there or below.
 */
export function acidForMashPh(estimatedPh: number, target: number, thicknessLPerKg: number, mashL: number, acid: 'lactic_acid' | 'phosphoric_acid' = 'lactic_acid'): number {
  if (estimatedPh <= target || mashL <= 0) return 0;
  const slope = (0.1085 * (thicknessLPerKg / 2.086) + 0.013) / 50; // pH per ppm RA
  const raDrop = (estimatedPh - target) / slope; // ppm as CaCO3
  const mmol = (raDrop / 50) * mashL; // mEq/L × L
  return mmol / ACID_MMOL_PER_ML[acid] / 1000;
}

// ---- The water of a recipe ---------------------------------------------------------------------------------

export interface WaterAdditionUse {
  agent: WaterAgent;
  amount: number;
  where: 'mash' | 'sparge' | 'kettle';
  /** From the recipe's other ingredients (e.g. "Calcium chloride" imported from Brewfather). */
  fromIngredients: boolean;
}

export interface WaterResult {
  /** Source water after dilution. */
  source: Ions;
  target: Ions | null;
  mash: Ions;
  sparge: Ions;
  /** All water together, as the beer gets it. */
  overall: Ions;
  additions: WaterAdditionUse[];
  mashL: number;
  spargeL: number;
  residualAlkalinity: number;
  so4ClRatio: number | null;
  mashPh: number | null;
  /** Lactic acid 80 % (L) to reach the target mash pH. */
  lacticForTarget: number;
  /** Things worth a look: chalk hardly dissolves, too much sodium, … */
  warnings: ('chalk' | 'sodium' | 'sulfate' | 'calciumLow' | 'noSource')[];
}

/** All water additions of a recipe: its water plan plus water agents among other ingredients. */
export function waterAdditions(doc: RecipeDoc): WaterAdditionUse[] {
  const fromPlan = doc.water.additions.map((a) => ({ agent: a.agent, amount: a.amount, where: a.where, fromIngredients: false }));
  const fromMiscs = doc.miscs.flatMap((m) => {
    const agent = waterAgentOf(m.name);
    if (!agent || m.amountKind !== WATER_AGENT_INFO[agent].amountKind) return [];
    const where = m.use === 'mash' ? 'mash' : m.use === 'sparge' ? 'sparge' : m.use === 'boil' || m.use === 'whirlpool' ? 'kettle' : null;
    return where ? [{ agent, amount: m.amount, where, fromIngredients: true } as WaterAdditionUse] : [];
  });
  return [...fromPlan, ...fromMiscs];
}

export function calculateWater(doc: RecipeDoc, calc: RecipeCalc): WaterResult {
  const w = doc.water;
  const source = dilute(ionsOf(w.source), w.dilutionPct);
  const additions = waterAdditions(doc);
  const v = calc.volumes;
  // Extract brewing: all water goes to the kettle.
  const mashL = v.strikeL > 0 ? v.strikeL : v.totalWaterL;
  const spargeL = v.spargeL;
  const at = (where: WaterAdditionUse['where']) => additions.filter((a) => a.where === where);
  const mash = addAgents(source, at('mash'), mashL);
  const sparge = spargeL > 0 ? addAgents(source, at('sparge'), spargeL) : { ...source };
  const totalL = mashL + spargeL;
  let overall = Object.fromEntries(WATER_IONS.map((k) => [k, totalL > 0 ? (mash[k] * mashL + sparge[k] * spargeL) / totalL : source[k]])) as Ions;
  overall = addAgents(overall, at('kettle'), totalL);

  const thickness = v.mashThicknessLPerKg ?? 3;
  const mashPh = v.mashGrainKg > 0 ? estimateMashPh(doc, mash, thickness) : null;
  const warnings: WaterResult['warnings'] = [];
  if (!w.source) warnings.push('noSource');
  if (additions.some((a) => a.agent === 'chalk' && a.amount > 0)) warnings.push('chalk');
  if (overall.sodium > 150) warnings.push('sodium');
  if (overall.sulfate > 500) warnings.push('sulfate');
  if (w.source && mash.calcium < 40) warnings.push('calciumLow');

  const clean = (ions: Ions) => Object.fromEntries(WATER_IONS.map((k) => [k, Math.max(0, ions[k])])) as Ions;
  return {
    source,
    target: w.target ? ionsOf(w.target) : null,
    mash: clean(mash),
    sparge: clean(sparge),
    overall: clean(overall),
    additions,
    mashL,
    spargeL,
    residualAlkalinity: residualAlkalinity(mash),
    so4ClRatio: sulfateChlorideRatio(overall),
    mashPh,
    lacticForTarget: mashPh != null ? acidForMashPh(mashPh, w.mashPhTarget, thickness, mashL) : 0,
    warnings,
  };
}

// ---- Suggesting additions ------------------------------------------------------------------------------------

/**
 * Non-negative least squares (Lawson–Hanson): x ≥ 0 minimising ‖Ax − b‖. Small dense problems only
 * (a few salts against six ions).
 */
export function nnls(A: number[][], b: number[], maxIter = 200): number[] {
  const n = A[0]?.length ?? 0;
  const x = new Array<number>(n).fill(0);
  const passive = new Set<number>();
  const tol = 1e-10;
  const residual = () => b.map((bi, i) => bi - A[i]!.reduce((s, a, j) => s + a * x[j]!, 0));
  const gradient = () => {
    const r = residual();
    return Array.from({ length: n }, (_, j) => A.reduce((s, row, i) => s + row[j]! * r[i]!, 0));
  };
  const solve = (cols: number[]) => {
    // Normal equations on the passive columns, by Gaussian elimination with partial pivoting.
    const k = cols.length;
    const M = cols.map((c1) => [...cols.map((c2) => A.reduce((s, row) => s + row[c1]! * row[c2]!, 0)), A.reduce((s, row, i) => s + row[c1]! * b[i]!, 0)]);
    for (let i = 0; i < k; i++) M[i]![i]! += 1e-12;
    for (let col = 0; col < k; col++) {
      let pivot = col;
      for (let r = col + 1; r < k; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
      [M[col], M[pivot]] = [M[pivot]!, M[col]!];
      for (let r = 0; r < k; r++) {
        if (r === col || M[col]![col] === 0) continue;
        const f = M[r]![col]! / M[col]![col]!;
        for (let c = col; c <= k; c++) M[r]![c]! -= f * M[col]![c]!;
      }
    }
    return M.map((row, i) => (row[i] === 0 ? 0 : row[k]! / row[i]!));
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const w = gradient();
    let best = -1;
    let bestW = tol;
    for (let j = 0; j < n; j++) if (!passive.has(j) && w[j]! > bestW) [best, bestW] = [j, w[j]!];
    if (best < 0) break;
    passive.add(best);
    for (let inner = 0; inner < maxIter; inner++) {
      const cols = [...passive];
      const z = solve(cols);
      if (z.every((v) => v > tol)) {
        x.fill(0);
        cols.forEach((c, i) => (x[c] = z[i]!));
        break;
      }
      let alpha = Infinity;
      cols.forEach((c, i) => {
        if (z[i]! <= tol) alpha = Math.min(alpha, x[c]! / (x[c]! - z[i]!));
      });
      cols.forEach((c, i) => (x[c] = x[c]! + alpha * (z[i]! - x[c]!)));
      for (const c of cols) if (x[c]! <= tol) (passive.delete(c), (x[c] = 0));
      if (!passive.size) break;
    }
  }
  return x;
}

export const DEFAULT_SALTS: WaterAgent[] = ['gypsum', 'calcium_chloride', 'epsom', 'table_salt', 'baking_soda'];

/**
 * Salt additions (kg, split between mash and sparge water by volume) that bring the source water
 * as close as possible to the target profile. Only the given agents are used; acids are left to
 * `acidForMashPh` (they are about mash pH, not the profile).
 */
export function suggestSalts(
  source: Ions,
  target: Ions,
  volumes: { mashL: number; spargeL: number },
  agents: WaterAgent[] = DEFAULT_SALTS,
): { agent: WaterAgent; amount: number; where: 'mash' | 'sparge' }[] {
  const salts = agents.filter((a) => WATER_AGENT_INFO[a].amountKind === 'mass');
  if (!salts.length) return [];
  // Each ion's error counts relative to its target, so 20 ppm off matters more for magnesium than for sulfate.
  const weight = (ion: WaterIon) => 1 / Math.max(target[ion], 20);
  const A = WATER_IONS.map((ion) => salts.map((s) => (AGENT_PPM[s][ion] ?? 0) * weight(ion)));
  const b = WATER_IONS.map((ion) => (target[ion] - source[ion]) * weight(ion));
  const gramsPerLitre = nnls(A, b);
  const out: { agent: WaterAgent; amount: number; where: 'mash' | 'sparge' }[] = [];
  salts.forEach((agent, i) => {
    const g = gramsPerLitre[i]!;
    for (const [where, litres] of [['mash', volumes.mashL], ['sparge', volumes.spargeL]] as const) {
      const grams = Math.round(g * litres * 10) / 10;
      if (grams >= 0.1) out.push({ agent, amount: grams / 1000, where });
    }
  });
  return out;
}

/** Seed key of a common target profile that suits a beer of this colour and bitterness. */
export function suggestTargetProfile(colorEbc: number, buGu: number): string {
  if (colorEbc < 15) return buGu >= 0.6 ? 'water:yellow-bitter' : 'water:yellow-balanced';
  if (colorEbc < 35) return buGu >= 0.7 ? 'water:pale-ale' : 'water:amber-balanced';
  if (colorEbc < 70) return 'water:brown-malty';
  return 'water:black-balanced';
}

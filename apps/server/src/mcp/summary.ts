import { calculateRecipe, calculateWater, equipmentFit } from '@brew/brewcalc';
import type { RecipeDoc } from '@brew/shared';

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * What the recipe editor shows, for an assistant: gravities, bitterness, colour, the grist and hop
 * contributions, volumes, water chemistry, vessels that are too small and the style's ranges.
 */
export function recipeSummary(doc: RecipeDoc) {
  const calc = calculateRecipe(doc);
  const water = calculateWater(doc, calc);
  const s = doc.style;
  return {
    og: round(calc.og, 4),
    fg: round(calc.fg, 4),
    abvPct: round(calc.abvPct, 2),
    ibu: round(calc.ibu, 1),
    colorEbc: round(calc.colorEbc, 1),
    buGu: round(calc.buGu, 2),
    preBoilGravity: round(calc.preBoilGravity, 4),
    attenuationPct: round(calc.attenuationPct, 1),
    totalFermentableKg: round(calc.totalFermentableKg, 3),
    totalHopKg: round(calc.totalHopKg, 4),
    grist: doc.fermentables.map((f, i) => ({ id: f.id, name: f.name, pct: round(calc.fermentables[i]?.pct ?? 0, 1), gravityPoints: round(calc.fermentables[i]?.points ?? 0, 1) })),
    hops: doc.hops.map((h, i) => ({ id: h.id, name: h.name, ibu: round(calc.hops[i]?.ibu ?? 0, 1) })),
    volumesL: Object.fromEntries(Object.entries(calc.volumes).map(([k, v]) => [k, typeof v === 'number' ? round(v, 2) : v])),
    strikeTempC: calc.strikeTempC != null ? round(calc.strikeTempC, 1) : null,
    style: s ? { name: s.name, code: `${s.categoryNumber}${s.styleLetter}`, og: s.og, fg: s.fg, ibu: s.ibu, colorEbc: s.colorEbc, abvPct: s.abvPct } : null,
    water: {
      mashPh: water.mashPh != null ? round(water.mashPh, 2) : null,
      residualAlkalinity: round(water.residualAlkalinity, 0),
      so4ClRatio: water.so4ClRatio != null ? round(water.so4ClRatio, 2) : null,
      resultPpm: Object.fromEntries(Object.entries(water.overall).map(([k, v]) => [k, round(v, 0)])),
      targetPpm: water.target,
      lacticAcidForTargetPhL: round(water.lacticForTarget, 5),
      warnings: water.warnings,
    },
    equipmentWarnings: equipmentFit(doc.equipment, calc.volumes),
  };
}

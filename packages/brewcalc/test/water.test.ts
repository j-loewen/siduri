import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT, newRecipeDoc, type RecipeDoc } from '@brew/shared';
import {
  acidForMashPh,
  addAgents,
  brewDaySteps,
  calculateRecipe,
  calculateWater,
  estimateMashPh,
  nnls,
  residualAlkalinity,
  suggestSalts,
  suggestTargetProfile,
  ZERO_IONS,
  type Ions,
} from '../src';

describe('water chemistry', () => {
  it('1 g of gypsum in 10 L adds 23 ppm calcium and 56 ppm sulfate', () => {
    const w = addAgents(ZERO_IONS, [{ agent: 'gypsum', amount: 0.001 }], 10);
    expect(w.calcium).toBeCloseTo(23.3, 1);
    expect(w.sulfate).toBeCloseTo(55.8, 1);
  });

  it('lactic acid neutralises bicarbonate', () => {
    const w = addAgents({ ...ZERO_IONS, bicarbonate: 200 }, [{ agent: 'lactic_acid', amount: 0.001 }], 10);
    expect(w.bicarbonate).toBeCloseTo(200 - 65, 0);
  });

  it('residual alkalinity', () => {
    // Alkalinity 163.9 − 50/3.5 − 10/7 = 148.2 ppm as CaCO3.
    expect(residualAlkalinity({ ...ZERO_IONS, bicarbonate: 200, calcium: 50, magnesium: 10 })).toBeCloseTo(148.2, 1);
  });

  it('nnls solves a small non-negative problem', () => {
    // Best fit with x ≥ 0: the second variable would want to be negative, so it stays 0.
    const x = nnls([[1, 0], [0, 1], [1, 1]], [2, -1, 1]);
    expect(x[1]).toBe(0);
    expect(x[0]).toBeCloseTo(1.5, 6);
  });

  it('suggests salts that reach a target from RO water', () => {
    const target: Ions = { calcium: 50, magnesium: 7, sodium: 5, sulfate: 75, chloride: 60, bicarbonate: 0 };
    const adds = suggestSalts(ZERO_IONS, target, { mashL: 15, spargeL: 15 });
    expect(adds.every((a) => a.amount > 0)).toBe(true);
    const mash = addAgents(ZERO_IONS, adds.filter((a) => a.where === 'mash'), 15);
    for (const ion of ['calcium', 'sulfate', 'chloride'] as const) expect(Math.abs(mash[ion] - target[ion]), ion).toBeLessThan(15);
    // Split by volume: the same profile in mash and sparge.
    const sparge = addAgents(ZERO_IONS, adds.filter((a) => a.where === 'sparge'), 15);
    expect(sparge.calcium).toBeCloseTo(mash.calcium, 0);
  });

  it('uses only the salts it is given', () => {
    const target: Ions = { calcium: 50, magnesium: 0, sodium: 0, sulfate: 120, chloride: 50, bicarbonate: 0 };
    const adds = suggestSalts(ZERO_IONS, target, { mashL: 20, spargeL: 0 }, ['gypsum']);
    expect(new Set(adds.map((a) => a.agent))).toEqual(new Set(['gypsum']));
    expect(adds.every((a) => a.where === 'mash')).toBe(true);
  });

  it('suggests a target profile by colour and bitterness', () => {
    expect(suggestTargetProfile(8, 0.4)).toBe('water:yellow-balanced');
    expect(suggestTargetProfile(8, 0.9)).toBe('water:yellow-bitter');
    expect(suggestTargetProfile(25, 0.9)).toBe('water:pale-ale');
    expect(suggestTargetProfile(150, 0.6)).toBe('water:black-balanced');
  });
});

function pale(extra: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    ...newRecipeDoc('Pale'),
    equipment: { ...DEFAULT_EQUIPMENT, libraryRef: null },
    fermentables: [
      { id: 'f1', libraryRef: null, name: 'Pale', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 6, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' },
    ],
    ...extra,
  };
}

describe('mash pH', () => {
  it('pale malt in distilled water mashes around 5.7', () => {
    const doc = pale();
    expect(estimateMashPh(doc, ZERO_IONS, 3)).toBeCloseTo(5.71, 1);
  });

  it('roasted malt and alkaline water move it the expected way', () => {
    const roasty = pale({ fermentables: [...pale().fermentables, { ...pale().fermentables[0]!, id: 'r', name: 'Roasted barley', grainGroup: 'roasted', colorEbc: 1200, amountKg: 0.5 }] });
    expect(estimateMashPh(roasty, ZERO_IONS, 3)!).toBeLessThan(estimateMashPh(pale(), ZERO_IONS, 3)! - 0.05);
    expect(estimateMashPh(pale(), { ...ZERO_IONS, bicarbonate: 250 }, 3)!).toBeGreaterThan(5.9);
  });

  it('acid for the target pH gets there', () => {
    const doc = pale();
    const water = { ...ZERO_IONS, bicarbonate: 250, calcium: 40 };
    const ph = estimateMashPh(doc, water, 3)!;
    const lacticL = acidForMashPh(ph, 5.4, 3, 15);
    const acidified = addAgents(water, [{ agent: 'lactic_acid', amount: lacticL }], 15);
    expect(estimateMashPh(doc, acidified, 3)).toBeCloseTo(5.4, 2);
  });
});

describe('recipe water', () => {
  it('combines source, dilution and additions in mash and sparge', () => {
    const doc = pale();
    doc.water = {
      ...doc.water,
      source: { libraryRef: null, name: 'Tap', calcium: 80, magnesium: 10, sodium: 20, sulfate: 40, chloride: 30, bicarbonate: 200 },
      dilutionPct: 50,
      additions: [
        { id: 'a1', agent: 'gypsum', amount: 0.003, where: 'mash' },
        { id: 'a2', agent: 'gypsum', amount: 0.002, where: 'sparge' },
      ],
    };
    const calc = calculateRecipe(doc);
    const w = calculateWater(doc, calc);
    expect(w.source.calcium).toBe(40);
    expect(w.mash.calcium).toBeCloseTo(40 + (232.8 * 3) / w.mashL, 4);
    expect(w.overall.sulfate).toBeGreaterThan(w.source.sulfate);
    expect(w.mashPh).not.toBeNull();
  });

  it('counts water agents among the ingredients (e.g. from Brewfather)', () => {
    const doc = pale({
      miscs: [{ id: 'm', libraryRef: null, name: 'Calcium Chloride (CaCl2)', type: 'water_agent', producer: '', amountKind: 'mass', amount: 0.004, use: 'mash', timeMin: null, notes: '' }],
    });
    const w = calculateWater(doc, calculateRecipe(doc));
    expect(w.additions).toEqual([{ agent: 'calcium_chloride', amount: 0.004, where: 'mash', fromIngredients: true }]);
    expect(w.mash.chloride).toBeGreaterThan(0);
    expect(w.warnings).toContain('noSource');
  });

  it('brew day weighs out the salts and adds them to strike and sparge water', () => {
    const doc = pale();
    doc.water.additions = [
      { id: 'a1', agent: 'gypsum', amount: 0.003, where: 'mash' },
      { id: 'a2', agent: 'lactic_acid', amount: 0.002, where: 'sparge' },
    ];
    const steps = brewDaySteps(doc, calculateRecipe(doc));
    expect(steps[0]!.items.filter((i) => i.agent).map((i) => [i.key, i.amountKind])).toEqual([
      ['gather:a1', 'mass'],
      ['gather:a2', 'volume'],
    ]);
    expect(steps.find((s) => s.id === 'heatStrike')!.items.map((i) => i.key)).toEqual(['add:a1']);
    expect(steps.find((s) => s.id === 'sparge')!.items.map((i) => i.key)).toEqual(['add:a2']);
  });
});

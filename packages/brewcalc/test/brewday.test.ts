import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT, newRecipeDoc, type RecipeDoc } from '@brew/shared';
import { brewDaySteps, calculateRecipe, fermentationSchedule, gravityCorrection, measuredEfficiency } from '../src';

function recipe(): RecipeDoc {
  return {
    ...newRecipeDoc('IPA'),
    equipment: { ...DEFAULT_EQUIPMENT, libraryRef: null },
    fermentables: [
      { id: 'malt', libraryRef: null, name: 'Pale', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 6, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' },
      { id: 'sugar', libraryRef: null, name: 'Dextrose', type: 'sugar', grainGroup: null, producer: '', origin: '', colorEbc: 0, potentialSg: 1.046, fermentability: 1, amountKg: 0.3, use: 'boil' },
    ],
    hops: [
      { id: 'h60', libraryRef: null, name: 'Magnum', producer: '', origin: '', form: 'pellet', alphaPct: 12, betaPct: null, amountKg: 0.02, use: 'boil', timeMin: 60, tempC: null, day: null, durationDays: null },
      { id: 'h10', libraryRef: null, name: 'Citra', producer: '', origin: '', form: 'pellet', alphaPct: 12, betaPct: null, amountKg: 0.03, use: 'boil', timeMin: 10, tempC: null, day: null, durationDays: null },
      { id: 'fwh', libraryRef: null, name: 'Saaz', producer: '', origin: '', form: 'pellet', alphaPct: 3, betaPct: null, amountKg: 0.02, use: 'first_wort', timeMin: 60, tempC: null, day: null, durationDays: null },
      { id: 'wp', libraryRef: null, name: 'Mosaic', producer: '', origin: '', form: 'pellet', alphaPct: 12, betaPct: null, amountKg: 0.05, use: 'whirlpool', timeMin: 20, tempC: 80, day: null, durationDays: null },
      { id: 'dh', libraryRef: null, name: 'Galaxy', producer: '', origin: '', form: 'pellet', alphaPct: 14, betaPct: null, amountKg: 0.1, use: 'dry_hop', timeMin: 0, tempC: null, day: 5, durationDays: 4 },
    ],
    cultures: [{ id: 'y', libraryRef: null, name: 'US-05', producer: '', productId: '', type: 'ale', form: 'dry', attenuationPct: 78, tempMinC: 15, tempMaxC: 24, amountKind: 'count', amount: 1 }],
    mash: { name: '', spargeTempC: 78, steps: [
      { id: 's1', name: 'Sacch', type: 'infusion', tempC: 66, timeMin: 60, rampMin: null, infuseL: null },
      { id: 's2', name: 'Mash out', type: 'temperature', tempC: 76, timeMin: 10, rampMin: null, infuseL: null },
    ] },
    fermentation: [
      { id: 'f1', name: 'Primary', tempC: 18, days: 10, rampDays: null },
      { id: 'f2', name: 'Cold crash', tempC: 2, days: 3, rampDays: null },
    ],
  };
}

describe('brew day steps', () => {
  it('follows the recipe from weighing to pitching', () => {
    const doc = recipe();
    const steps = brewDaySteps(doc, calculateRecipe(doc));
    expect(steps.map((s) => s.id)).toEqual(['gather', 'heatStrike', 'mashIn', 'mash:s1', 'mash:s2', 'sparge', 'preBoil', 'boil', 'whirlpool', 'chill', 'measureOg', 'pitch']);
    const gather = steps[0]!;
    expect(gather.items.map((i) => i.key)).toContain('gather:dh');
    expect(gather.items.find((i) => i.kind === 'water')!.amount).toBeGreaterThan(20);
    expect(steps.find((s) => s.id === 'sparge')).toMatchObject({ tempC: 78, items: [{ key: 'add:fwh' }] });
    const boil = steps.find((s) => s.id === 'boil')!;
    expect(boil.timerMin).toBe(60);
    // Sugar at the start, then 60 and 10 minutes before the end.
    expect(boil.items.map((i) => [i.key, i.atMin])).toEqual([['add:sugar', 60], ['add:h60', 60], ['add:h10', 10]]);
    expect(steps.find((s) => s.id === 'whirlpool')).toMatchObject({ timerMin: 20, tempC: 80 });
    expect(steps.find((s) => s.id === 'chill')!.tempC).toBe(18);
  });

  it('BIAB has no sparge; extract recipes have no mash', () => {
    const biab = { ...recipe(), equipment: { ...DEFAULT_EQUIPMENT, method: 'biab' as const, libraryRef: null } };
    expect(brewDaySteps(biab, calculateRecipe(biab)).map((s) => s.id)).toContain('lauter');
    const extract = { ...recipe(), fermentables: recipe().fermentables.map((f) => ({ ...f, use: f.use === 'mash' ? ('steep' as const) : f.use })) };
    const ids = brewDaySteps(extract, calculateRecipe(extract)).map((s) => s.id);
    expect(ids).toContain('steep');
    expect(ids).not.toContain('mashIn');
  });
});

describe('measurements', () => {
  it('hitting the targets means the planned efficiency', () => {
    const doc = recipe();
    const calc = calculateRecipe(doc);
    expect(measuredEfficiency(doc, calc, 'fermenter', { gravity: calc.og, volumeL: doc.batchSizeL })).toBeCloseTo(doc.efficiencyPct, 6);
    expect(measuredEfficiency(doc, calc, 'preBoil', { gravity: calc.preBoilGravity, volumeL: calc.volumes.preBoilL })).toBeCloseTo(doc.efficiencyPct, 6);
    // Fewer points than planned: lower efficiency.
    expect(measuredEfficiency(doc, calc, 'fermenter', { gravity: calc.og - 0.005, volumeL: doc.batchSizeL })!).toBeLessThan(doc.efficiencyPct);
  });

  it('suggests corrections', () => {
    expect(gravityCorrection(1.05, 20, 1.051)).toEqual({ kind: 'ok' });
    expect(gravityCorrection(1.06, 20, 1.05)).toMatchObject({ kind: 'dilute', waterL: expect.closeTo(4, 5) });
    const weak = gravityCorrection(1.04, 25, 1.045, 3);
    expect(weak.kind).toBe('strengthen');
    if (weak.kind === 'strengthen') {
      expect(weak.extractKg).toBeGreaterThan(0.2);
      // 25 L → 22.2 L needs 2.8 L more boil-off at 3 L/h ≈ 56 min.
      expect(weak.extraBoilMin).toBeCloseTo(55.6, 0);
    }
  });

  it('builds the fermentation schedule', () => {
    expect(fermentationSchedule(recipe()).map((e) => [e.day, e.kind, e.name])).toEqual([
      [0, 'step', 'Primary'],
      [5, 'dryHop', 'Galaxy'],
      [9, 'dryHopOut', 'Galaxy'],
      [10, 'step', 'Cold crash'],
    ]);
  });
});

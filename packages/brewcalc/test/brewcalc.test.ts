import { describe, expect, it } from 'vitest';
import { lovibondToSrm, newRecipeDoc, srmToEbc, sgToPlato, DEFAULT_EQUIPMENT, type RecipeDoc } from '@brew/shared';
import {
  abvAdvanced,
  abvSimple,
  apparentAttenuation,
  beerColorHex,
  brewVolumes,
  calculateRecipe,
  dilutionToTarget,
  equipmentFit,
  fermenterFit,
  hopIbu,
  hydrometerCorrection,
  moreyEbc,
  pointsPerKgPerL,
  realAttenuation,
  refractometerToSg,
  scaleRecipe,
  strikeTemperature,
} from '../src';

const LB = 0.45359237;
const GAL = 3.785411784;
const OZ = LB / 16;

describe('gravity', () => {
  it('1 lb of a 1.037 malt in 1 gallon gives 37 points', () => {
    expect((pointsPerKgPerL(1.037) * LB) / GAL).toBeCloseTo(37, 2);
  });

  it('ABV formulas', () => {
    expect(abvSimple(1.05, 1.01)).toBeCloseTo(5.25, 2);
    expect(abvAdvanced(1.05, 1.01)).toBeCloseTo(5.31, 1);
  });

  it('gives no negative alcohol or attenuation for a gravity above the OG', () => {
    expect(abvSimple(1.05, 1.112)).toBe(0);
    expect(abvAdvanced(1.05, 1.112)).toBe(0);
    expect(apparentAttenuation(1.05, 1.112)).toBe(0);
    expect(realAttenuation(1.05, 1.112)).toBe(0);
    // Below 1.000 is real: apparent attenuation over 100 %.
    expect(apparentAttenuation(1.05, 0.998)).toBeCloseTo(104, 0);
  });

  it('Plato conversion', () => {
    expect(sgToPlato(1.04)).toBeCloseTo(10.0, 0);
  });

  it('hydrometer temperature correction', () => {
    expect(hydrometerCorrection(1.05, 20, 20)).toBeCloseTo(1.05, 5);
    // Hot sample reads low.
    expect(hydrometerCorrection(1.05, 40, 20)).toBeGreaterThan(1.055);
  });

  it('refractometer', () => {
    // Unfermented 12.5 °Bx with WCF 1.04 ≈ 1.048.
    expect(refractometerToSg(12.5)).toBeCloseTo(1.048, 3);
    // Fermented sample (Terrill): 12.5 → 6.5 °Bx ≈ 1.011.
    expect(refractometerToSg(6.5, { originalBrix: 12.5 })).toBeCloseTo(1.011, 2);
  });

  it('dilution', () => {
    // 20 L at 1.060 diluted to 1.050 needs 4 L of water.
    expect(dilutionToTarget(1.06, 20, 1.05)).toBeCloseTo(4, 5);
  });
});

describe('bitterness (Tinseth)', () => {
  it('1 oz of 10 % hops boiled 60 min in 5 gal at 1.050 ≈ 34.5 IBU', () => {
    const ibu = hopIbu(
      { use: 'boil', timeMin: 60, tempC: null, alphaPct: 10, amountKg: OZ },
      { gravity: 1.05, volumeL: 5 * GAL, boilTimeMin: 60 },
    );
    expect(ibu).toBeCloseTo(34.55, 1);
  });

  it('dry hops add nothing, whirlpool adds less than boiling', () => {
    const base = { tempC: null, alphaPct: 10, amountKg: 0.05 } as const;
    const opts = { gravity: 1.05, volumeL: 20, boilTimeMin: 60 };
    expect(hopIbu({ ...base, use: 'dry_hop', timeMin: 0 }, opts)).toBe(0);
    const wp = hopIbu({ ...base, use: 'whirlpool', timeMin: 20, tempC: 80 }, opts);
    const boil = hopIbu({ ...base, use: 'boil', timeMin: 20 }, opts);
    expect(wp).toBeGreaterThan(0);
    expect(wp).toBeLessThan(boil / 2);
  });
});

describe('colour (Morey)', () => {
  it('10 lb of 2 SRM malt in 5 gal ≈ 3.86 SRM (malt SRM used as °L, like Brewfather)', () => {
    expect(moreyEbc([{ amountKg: 10 * LB, colorEbc: srmToEbc(2) }], 5 * GAL)).toBeCloseTo(srmToEbc(3.862), 1);
  });

  it('matches Brewfather for a dark grist (Irish stout, 37.4 SRM)', () => {
    const grist = [
      { amountKg: 3.62874, colorEbc: srmToEbc(3) },
      { amountKg: 1.04893, colorEbc: srmToEbc(2) },
      { amountKg: 0.53864, colorEbc: srmToEbc(609) },
    ];
    // 25 L into the fermenter + 1 L kettle loss.
    expect(moreyEbc(grist, 26) / 1.97).toBeCloseTo(37.4, 0);
  });

  it('swatch colours get darker', () => {
    expect(beerColorHex(5)).toMatch(/^#[0-9a-f]{6}$/);
    const brightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16);
    expect(brightness(beerColorHex(10))).toBeGreaterThan(brightness(beerColorHex(80)));
  });
});

describe('volumes', () => {
  it('strike temperature', () => {
    expect(strikeTemperature(67, 20, 3)).toBeCloseTo(73.42, 2);
  });

  it('works back from the fermenter through the losses', () => {
    const v = brewVolumes(DEFAULT_EQUIPMENT, { batchSizeL: 20, boilTimeMin: 60, mashGrainKg: 5 });
    expect(v.postBoilL).toBeCloseTo(21, 5); // + 1 L kettle loss
    expect(v.postBoilHotL).toBeCloseTo(21 / 0.96, 5);
    expect(v.preBoilL).toBeCloseTo(21 / 0.96 + 3, 5);
    expect(v.strikeL).toBeCloseTo(15, 5); // 5 kg × 3 L/kg
    // Cold water: the hot pre-boil volume shrinks back by 4 %.
    expect(v.totalWaterL).toBeCloseTo(v.preBoilL * 0.96 + 5 * 0.96, 5);
    expect(v.spargeL).toBeCloseTo(v.totalWaterL - 15, 5);
  });

  it('matches Brewfather for a BrewZilla 35L profile', () => {
    // Brewfather: 25 L into the fermenter, 1 L trub/chiller loss, 3 L/h boil-off, 4 % shrinkage,
    // 6.75 L mash tun dead space, 0.8 L/kg absorption, 3 L/kg → 30.08 L pre-boil (hot),
    // 22.4 L mash, 10.65 L sparge, 33.05 L total, 25.89 L mash volume.
    const brewzilla = { ...DEFAULT_EQUIPMENT, kettleLossL: 1, boilOffLPerH: 3, coolingShrinkagePct: 4, mashTunRecoverableL: 6.75, grainAbsorptionLPerKg: 0.8, mashThicknessLPerKg: 3 };
    const v = brewVolumes(brewzilla, { batchSizeL: 25, boilTimeMin: 60, mashGrainKg: 5.217 });
    expect(v.preBoilL).toBeCloseTo(30.08, 2);
    expect(v.postBoilHotL).toBeCloseTo(27.08, 2);
    expect(v.strikeL).toBeCloseTo(22.4, 1);
    expect(v.spargeL).toBeCloseTo(10.65, 1);
    expect(v.totalWaterL).toBeCloseTo(33.05, 1);
    expect(v.mashVolumeL).toBeCloseTo(25.89, 1);
  });

  it('mash tun dead space adds to the mash water, mash tun loss to the total', () => {
    const opts = { batchSizeL: 20, boilTimeMin: 60, mashGrainKg: 5 };
    const base = brewVolumes(DEFAULT_EQUIPMENT, opts);
    const dead = brewVolumes({ ...DEFAULT_EQUIPMENT, mashTunRecoverableL: 6.8 }, opts);
    expect(dead.strikeL).toBeCloseTo(15 + 6.8, 5);
    expect(dead.totalWaterL).toBeCloseTo(base.totalWaterL, 5);
    expect(dead.spargeL).toBeCloseTo(base.spargeL - 6.8, 5);
    expect(dead.mashVolumeL).toBeCloseTo(base.mashVolumeL + 6.8, 5);
    const loss = brewVolumes({ ...DEFAULT_EQUIPMENT, mashTunDeadspaceL: 2 }, opts);
    expect(loss.strikeL).toBeCloseTo(15, 5);
    expect(loss.totalWaterL).toBeCloseTo(base.totalWaterL + 2, 5);
  });

  it('BIAB puts all water in the mash', () => {
    const v = brewVolumes({ ...DEFAULT_EQUIPMENT, method: 'biab' }, { batchSizeL: 20, boilTimeMin: 60, mashGrainKg: 5 });
    expect(v.spargeL).toBe(0);
    expect(v.strikeL).toBeCloseTo(v.totalWaterL, 5);
  });

  it('warns when the mash tun or kettle is too small', () => {
    const opts = { batchSizeL: 20, boilTimeMin: 60, mashGrainKg: 8 };
    // 8 kg × 3 L/kg strike + grain displacement ≈ 29.4 L in a 25 L tun; about 25 L pre-boil in a 22 L kettle.
    const small = { ...DEFAULT_EQUIPMENT, mashTunVolumeL: 25, kettleVolumeL: 22 };
    const issues = equipmentFit(small, brewVolumes(small, opts));
    expect(issues.map((i) => i.vessel)).toEqual(['mashTun', 'kettle']);
    expect(issues[0]!.needL).toBeCloseTo(8 * 3 + 8 * 0.67, 5);
    expect(issues[0]!.capacityL).toBe(25);

    const big = { ...DEFAULT_EQUIPMENT, mashTunVolumeL: 40, kettleVolumeL: 40 };
    expect(equipmentFit(big, brewVolumes(big, opts))).toEqual([]);
    // Unknown sizes are not checked.
    expect(equipmentFit(DEFAULT_EQUIPMENT, brewVolumes(DEFAULT_EQUIPMENT, opts))).toEqual([]);
    expect(equipmentFit(null, brewVolumes(DEFAULT_EQUIPMENT, opts))).toEqual([]);
  });

  it('warns when the batch does not fit the fermenter', () => {
    const eq = { ...DEFAULT_EQUIPMENT, fermenterVolumeL: 30 };
    const v = brewVolumes(eq, { batchSizeL: 40, boilTimeMin: 60, mashGrainKg: 8 });
    expect(equipmentFit(eq, v)).toEqual([{ vessel: 'fermenter', problem: 'tooSmall', needL: 40, capacityL: 30 }]);
    // The batch's own fermenter counts instead of the equipment's, also without equipment.
    expect(equipmentFit(eq, v, 60)).toEqual([]);
    expect(equipmentFit(null, v, 25)).toEqual([{ vessel: 'fermenter', problem: 'tooSmall', needL: 40, capacityL: 25 }]);
  });

  it('warns when a fermenter leaves too little headspace', () => {
    // 15 % of the fermenter should stay free for the krausen.
    expect(fermenterFit(20, 30)).toBeNull(); // a third free
    expect(fermenterFit(25.5, 30)).toBeNull(); // exactly 15 % free
    expect(fermenterFit(27, 30)).toBe('littleHeadspace'); // 10 % free
    expect(fermenterFit(30, 30)).toBe('littleHeadspace'); // full to the brim
    expect(fermenterFit(31, 30)).toBe('tooSmall');
    expect(fermenterFit(20, null)).toBeNull();
    const v = brewVolumes(DEFAULT_EQUIPMENT, { batchSizeL: 28, boilTimeMin: 60, mashGrainKg: 6 });
    expect(equipmentFit(DEFAULT_EQUIPMENT, v, 30)).toEqual([{ vessel: 'fermenter', problem: 'littleHeadspace', needL: 28, capacityL: 30 }]);
  });

  it('BIAB mashes in the kettle when there is no mash tun', () => {
    const biab = { ...DEFAULT_EQUIPMENT, method: 'biab' as const, kettleVolumeL: 30 };
    const v = brewVolumes(biab, { batchSizeL: 20, boilTimeMin: 60, mashGrainKg: 6 });
    // All the water plus the grain: more than the 30 L kettle, although the wort alone fits.
    expect(v.preBoilL).toBeLessThan(30);
    expect(equipmentFit(biab, v)).toEqual([{ vessel: 'mashTun', problem: 'tooSmall', needL: v.mashVolumeL, capacityL: 30 }]);
  });
});

function pale(): RecipeDoc {
  return {
    ...newRecipeDoc('Pale'),
    batchSizeL: 20,
    efficiencyPct: 72,
    fermentables: [
      { id: 'f1', libraryRef: null, name: 'Pilsner', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 3.5, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' },
    ],
    hops: [
      { id: 'h1', libraryRef: null, name: 'Magnum', producer: '', origin: '', form: 'pellet', alphaPct: 12, betaPct: null, amountKg: 0.02, use: 'boil', timeMin: 60, tempC: null, day: null, durationDays: null },
    ],
    cultures: [
      { id: 'y1', libraryRef: null, name: 'US-05', producer: '', productId: '', type: 'ale', form: 'dry', attenuationPct: 80, tempMinC: null, tempMaxC: null, amountKind: 'count', amount: 1 },
    ],
  };
}

describe('calculateRecipe', () => {
  it('estimates OG, FG and ABV', () => {
    const c = calculateRecipe(pale());
    // 308.78 pts/kg/L × 5 kg × 0.72 / 20 L = 55.6 points.
    expect(c.og).toBeCloseTo(1.0556, 4);
    expect(c.fg).toBeCloseTo(1 + 0.0556 * 0.2, 3);
    expect(c.abvPct).toBeCloseTo(abvSimple(c.og, c.fg), 6);
    expect(c.ibu).toBeGreaterThan(25);
    expect(c.ibu).toBeLessThan(35);
    expect(c.fermentables[0]!.pct).toBe(100);
  });

  it('unfermentable sugars raise the FG', () => {
    const doc = pale();
    doc.fermentables.push({ ...doc.fermentables[0]!, id: 'f2', name: 'Lactose', type: 'sugar', potentialSg: 1.035, fermentability: 0, amountKg: 0.5, use: 'boil' });
    const c = calculateRecipe(doc);
    const plain = calculateRecipe(pale());
    expect(c.fg - plain.fg).toBeGreaterThan(0.007);
  });

  it('scaling keeps the numbers', () => {
    const doc = pale();
    const a = calculateRecipe(doc);
    const b = calculateRecipe(scaleRecipe(doc, 40, 80));
    expect(b.og).toBeCloseTo(a.og, 6);
    expect(b.ibu).toBeCloseTo(a.ibu, 6);
    expect(b.colorEbc).toBeGreaterThan(a.colorEbc * 0.9);
  });

  it('pre-boil gravity is lower than OG', () => {
    const c = calculateRecipe({ ...pale(), equipment: { ...DEFAULT_EQUIPMENT, libraryRef: null } });
    expect(c.preBoilGravity).toBeLessThan(c.og);
    expect(c.strikeTempC).toBeNull(); // no mash steps
  });
});

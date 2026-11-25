import { describe, expect, it } from 'vitest';
import { convert, METRIC_UNITS, parseQuantity, preferredUnit, readableMass, readableMassUnitId, readableUnitId, readableVolume, readableVolumeUnitId, recipeDocSchema, resolvePrefs, sgToPlato, toCanonical, US_UNITS } from '../src';

describe('units', () => {
  it('converts between units', () => {
    expect(convert(1, 'mass', 'lb', 'kg')).toBeCloseTo(0.45359, 5);
    expect(convert(5, 'volume', 'gal', 'l')).toBeCloseTo(18.927, 3);
    expect(convert(152, 'temperature', 'f', 'c')).toBeCloseTo(66.67, 2);
    expect(convert(10, 'gravity', 'plato', 'sg')).toBeCloseTo(1.04, 3);
    expect(convert(10, 'color', 'srm', 'ebc')).toBeCloseTo(19.7, 5);
    expect(convert(2, 'color', 'lovibond', 'ebc')).toBeCloseTo(3.84, 2);
    expect(convert(250, 'diastaticPower', 'wk', 'lintner')).toBeCloseTo(76, 0);
    expect(convert(1.5, 'specificVolume', 'qtlb', 'lkg')).toBeCloseTo(3.13, 2);
  });

  it('round-trips every unit', () => {
    for (const [dimension, value] of [['gravity', 1.05], ['color', 20], ['temperature', 67], ['mass', 4.2]] as const) {
      for (const unit of ['sg', 'plato', 'brix', 'ebc', 'srm', 'lovibond', 'c', 'f', 'kg', 'g', 'lb', 'oz']) {
        try {
          expect(toCanonical(convert(value, dimension, toUnit(dimension), unit), dimension, unit)).toBeCloseTo(value, 6);
        } catch {
          // Unit of another dimension.
        }
      }
    }
  });

  it('parses typed quantities', () => {
    expect(parseQuantity('mass', '5 lb')).toMatchObject({ value: 5, unit: { id: 'lb' } });
    expect(parseQuantity('mass', '4,5')).toEqual({ value: 4.5 });
    expect(parseQuantity('gravity', '12 °P')).toMatchObject({ value: 12, unit: { id: 'plato' } });
    expect(parseQuantity('gravity', '12')).toMatchObject({ value: 12, unit: { id: 'plato' } });
    expect(parseQuantity('gravity', '1.050')).toEqual({ value: 1.05 });
    expect(parseQuantity('temperature', '152F')).toMatchObject({ value: 152, unit: { id: 'f' } });
    expect(parseQuantity('volume', '5 gallons')).toMatchObject({ unit: { id: 'gal' } });
    expect(parseQuantity('mass', 'abc')).toBeNull();
    expect(parseQuantity('mass', '5 parsecs')).toBeNull();
    expect(sgToPlato(1.0)).toBeCloseTo(0, 1);
  });

  it('preferences fall back to metric', () => {
    expect(preferredUnit({ ...METRIC_UNITS, massLarge: 'nonsense' }, 'massLarge').id).toBe('kg');
    expect(preferredUnit(US_UNITS, 'temperature').id).toBe('f');
    expect(resolvePrefs({ units: { volume: 'gal' } }).units).toMatchObject({ volume: 'gal', massLarge: 'kg' });
  });

  it('fills recipe defaults', () => {
    const doc = recipeDocSchema.parse({ name: 'X' });
    expect(doc).toMatchObject({ batchSizeL: 20, boilTimeMin: 60, fermentables: [], style: null });
  });
});

function toUnit(dimension: string) {
  return { gravity: 'sg', color: 'ebc', temperature: 'c', mass: 'kg' }[dimension]!;
}

describe('new recipe documents', () => {
  it('do not share nested arrays', () => {
    const a = recipeDocSchema.parse({ name: 'A' });
    a.water.additions.push({ id: 'x', agent: 'gypsum', amount: 0.001, where: 'mash' });
    a.mash.steps.push({ id: 's', name: 'Rest', type: 'temperature', tempC: 67, timeMin: 60, rampMin: null, infuseL: null });
    const b = recipeDocSchema.parse({ name: 'B' });
    expect(b.water.additions).toEqual([]);
    expect(b.mash.steps).toEqual([]);
  });
});

describe('readable weights', () => {
  const LB = 0.45359237;
  const show = (kg: number, unit: string) => readableMass(kg, unit).map((p) => `${Math.round(p.value * 10 ** p.decimals) / 10 ** p.decimals} ${p.unit.symbol}`).join(' ');

  it('uses ounces below a pound and splits larger weights into pounds and ounces', () => {
    expect(show(0.19 * LB, 'lb')).toBe('3 oz');
    expect(show(11.38 * LB, 'lb')).toBe('11 lb 6 oz');
    expect(show(6 * LB, 'lb')).toBe('6 lb');
    expect(show(5.999 * LB, 'lb')).toBe('6 lb'); // 15.98 oz round up to the next pound
    expect(show(0.5 * (LB / 16), 'oz')).toBe('0.5 oz');
    expect(show(20 * (LB / 16), 'oz')).toBe('1 lb 4 oz');
  });

  it('uses grams below a kilogram and kilograms above', () => {
    expect(show(0.6, 'kg')).toBe('600 g');
    expect(show(0.0115, 'kg')).toBe('11.5 g'); // a tenth of a gram below 100 g
    expect(show(0.0042, 'kg')).toBe('4.2 g');
    expect(show(9.072, 'kg')).toBe('9.072 kg');
    expect(show(1.2, 'g')).toBe('1.2 kg');
    expect(show(0.03, 'g')).toBe('30 g');
  });

  it('keeps the sign and zero', () => {
    expect(show(-0.25, 'kg')).toBe('-250 g');
    expect(show(-1.5 * LB, 'lb')).toBe('-1 lb 8 oz');
    expect(show(0, 'lb')).toBe('0 lb');
  });

  it('opens weight fields in the smaller unit for small amounts', () => {
    expect(readableMassUnitId(0.6, 'kg')).toBe('g');
    expect(readableMassUnitId(2, 'kg')).toBe('kg');
    expect(readableMassUnitId(0.19 * LB, 'lb')).toBe('oz');
    expect(readableMassUnitId(0, 'lb')).toBe('lb');
    expect(readableMassUnitId(null, 'kg')).toBe('kg');
  });
});

describe('readable volumes', () => {
  const GAL = 3.785411784;
  const show = (l: number, unit: string) => readableVolume(l, unit).map((p) => `${Math.round(p.value * 10 ** p.decimals) / 10 ** p.decimals} ${p.unit.symbol}`).join(' ');

  it('uses millilitres below a litre and litres above', () => {
    expect(show(0.25, 'l')).toBe('250 ml');
    expect(show(0.0086, 'l')).toBe('8.6 ml');
    expect(show(21.5, 'l')).toBe('21.5 L');
    expect(show(1.5, 'ml')).toBe('1.5 L');
    expect(show(0.005, 'ml')).toBe('5 ml');
  });

  it('uses quarts and fluid ounces below a gallon; gallons stay decimal', () => {
    expect(show(0.5 * GAL, 'gal')).toBe('2 qt');
    expect(show((6 / 128) * GAL, 'gal')).toBe('6 fl oz');
    expect(show(5.5 * GAL, 'gal')).toBe('5.5 gal');
    expect(show((0.3 / 128) * GAL, 'floz')).toBe('0.3 fl oz');
    expect(show(2 * GAL, 'floz')).toBe('2 gal');
  });

  it('keeps other units, zero and the sign', () => {
    expect(show(150, 'hl')).toBe('1.5 hl');
    expect(show(0, 'gal')).toBe('0 gal');
    expect(show(-0.2, 'l')).toBe('-200 ml');
  });

  it('opens volume fields in the smaller unit for small amounts', () => {
    expect(readableVolumeUnitId(0.5, 'l')).toBe('ml');
    expect(readableVolumeUnitId(20, 'l')).toBe('l');
    expect(readableVolumeUnitId(0.5 * GAL, 'gal')).toBe('qt');
    expect(readableVolumeUnitId(0.1, 'gal')).toBe('floz');
    expect(readableUnitId('volume', 0.5, 'l')).toBe('ml');
    expect(readableUnitId('temperature', 0.5, 'c')).toBe('c');
  });
});

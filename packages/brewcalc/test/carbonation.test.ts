import { describe, expect, it } from 'vitest';
import { batchCarbonationSchema, newRecipeDoc } from '@brew/shared';
import { carbonationPlan, defaultCarbonationTemp, forceCarbonationBar, primingSugarKg, recipeCarbonation, residualCo2 } from '../src';

describe('carbonation', () => {
  it('residual CO2 falls as the beer gets warmer', () => {
    expect(residualCo2(21)).toBeCloseTo(0.84, 2);
    expect(residualCo2(10)).toBeCloseTo(1.2, 2);
    expect(residualCo2(4)).toBeGreaterThan(residualCo2(10));
  });

  it('priming sugar: about 4 g/L of table sugar per missing volume', () => {
    // 23 L at 21 °C to 2.4 vols: (2.4 − 0.84) × 4 g/L × 23 L ≈ 144 g.
    const sucrose = primingSugarKg({ targetVols: 2.4, beerTempC: 21, volumeL: 23 });
    expect(sucrose * 1000).toBeCloseTo(143.9, 0);
    // Corn sugar and DME give less CO2 per gram, so more is needed; a keg needs half.
    expect(primingSugarKg({ targetVols: 2.4, beerTempC: 21, volumeL: 23, sugar: 'dextrose' })).toBeCloseTo(sucrose / 0.91, 6);
    expect(primingSugarKg({ targetVols: 2.4, beerTempC: 21, volumeL: 23, sugar: 'dme' })).toBeGreaterThan(sucrose * 1.4);
    expect(primingSugarKg({ targetVols: 2.4, beerTempC: 21, volumeL: 23, keg: true })).toBeCloseTo(sucrose / 2, 6);
  });

  it('no sugar when the beer already holds enough CO2', () => {
    expect(primingSugarKg({ targetVols: 1, beerTempC: 4, volumeL: 20 })).toBe(0);
  });

  it('force carbonation: 2.4 vols at 4 °C ≈ 11 psi, 2.8 vols ≈ 15 psi', () => {
    expect(forceCarbonationBar(2.4, 4) / 0.0689475729).toBeCloseTo(10.8, 0);
    expect(forceCarbonationBar(2.8, 4) / 0.0689475729).toBeCloseTo(15.1, 0);
    // Warmer beer needs more pressure for the same carbonation.
    expect(forceCarbonationBar(2.4, 10)).toBeGreaterThan(forceCarbonationBar(2.4, 4));
  });

  it('defaults: style carbonation, warmest fermentation step, cold keg', () => {
    const doc = newRecipeDoc('Test');
    expect(recipeCarbonation(doc)).toBe(2.4);
    expect(recipeCarbonation({ ...doc, carbonationVols: 2.7 })).toBe(2.7);
    expect(defaultCarbonationTemp('bottle', [])).toBe(20);
    expect(defaultCarbonationTemp('bottle', [{ id: 'a', name: 'Primary', tempC: 18, days: 10, rampDays: null }, { id: 'b', name: 'Rest', tempC: 21, days: 3, rampDays: null }])).toBe(21);
    expect(defaultCarbonationTemp('keg_force', [])).toBe(4);

    // A new batch bottles at the recipe's carbonation; its own settings win.
    const bottle = carbonationPlan(batchCarbonationSchema.parse({}), { ...doc, carbonationVols: 2.2 }, 20);
    expect(bottle.method).toBe('bottle');
    expect(bottle.targetVols).toBe(2.2);
    const keg = carbonationPlan({ method: 'keg_force', vols: 2.6, tempC: null }, doc, 19);
    expect(keg.method === 'keg_force' && keg.tempC).toBe(4);
    expect(keg.targetVols).toBe(2.6);
  });
});

import type { WaterData } from '@brew/shared';

const w = (name: string, ions: [number, number, number, number, number, number], notes: string): WaterData => {
  const [calcium, magnesium, sodium, sulfate, chloride, bicarbonate] = ions;
  return { name, role: 'target', calcium, magnesium, sodium, sulfate, chloride, bicarbonate, ph: null, notes };
};

const CITY = 'Historic brewing water of the city (approximate; published figures vary).';
const STYLE = 'Commonly used starting point for this kind of beer, not a hard rule.';

/**
 * Classic target water profiles (ppm: Ca, Mg, Na, SO₄, Cl, HCO₃). City profiles follow the
 * widely published "How to Brew" table; style profiles are common modern starting points.
 */
export const WATER_PROFILES: { seedKey: string; data: WaterData }[] = [
  ['distilled', w('Distilled / RO water', [0, 0, 0, 0, 0, 0], 'Pure water: a blank start for building any profile.')],
  ['pilsen', w('Pilsen', [10, 3, 3, 4, 4, 3], CITY + ' Very soft: Bohemian Pilsner.')],
  ['munich', w('Munich', [76, 17, 2, 41, 2, 200], CITY + ' Carbonate water for dark lagers (Dunkel, Bock).')],
  ['vienna', w('Vienna', [200, 60, 8, 125, 12, 120], CITY + ' Vienna lager, Märzen.')],
  ['dortmund', w('Dortmund', [225, 40, 60, 120, 60, 220], CITY + ' Dortmunder Export.')],
  ['burton', w('Burton upon Trent', [352, 24, 44, 820, 16, 320], CITY + ' Very high sulfate: crisp, bitter pale ales and IPAs.')],
  ['london', w('London', [52, 32, 86, 32, 34, 104], CITY + ' Porter, bitter, mild.')],
  ['dublin', w('Dublin', [118, 4, 12, 54, 19, 319], CITY + ' High carbonate: dry stout.')],
  ['edinburgh', w('Edinburgh', [125, 25, 55, 140, 65, 225], CITY + ' Scottish ales.')],
  ['yellow-balanced', w('Light & balanced', [50, 7, 5, 75, 60, 0], STYLE + ' Pale lagers, Kölsch, Helles.')],
  ['yellow-bitter', w('Light & hoppy', [50, 7, 5, 150, 50, 0], STYLE + ' Pilsner with more bite, light pale ales.')],
  ['pale-ale', w('Pale ale / IPA', [110, 18, 15, 300, 55, 0], STYLE + ' Accentuates hop bitterness and dryness.')],
  ['neipa', w('Hazy IPA', [100, 10, 15, 75, 150, 0], STYLE + ' Chloride-forward for a soft, full mouthfeel.')],
  ['amber-balanced', w('Amber & balanced', [60, 10, 15, 75, 75, 40], STYLE + ' Amber ales, Märzen, Vienna lager.')],
  ['brown-malty', w('Brown & malty', [60, 10, 25, 50, 80, 80], STYLE + ' Brown ales, Dunkel, Bock.')],
  ['black-balanced', w('Dark & roasty', [60, 10, 25, 60, 60, 150], STYLE + ' Porter, stout: alkalinity offsets the acidity of roasted malt.')],
].map(([key, data]) => ({ seedKey: `water:${key as string}`, data: data as WaterData }));

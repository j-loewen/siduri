/**
 * Units of measurement. Everything is stored and sent to the server in one canonical unit per
 * dimension (SI-like: kg, L, °C, SG, EBC, minutes, bar, vols). The UI shows values in the unit
 * the user prefers for that kind of value, and every input can switch its unit on the spot.
 */

export type Dimension =
  | 'mass'
  | 'volume'
  | 'temperature'
  | 'gravity'
  | 'color'
  | 'time'
  | 'pressure'
  | 'carbonation'
  | 'diastaticPower'
  | 'specificVolume'
  | 'rate';

export interface UnitDef {
  id: string;
  /** Short label shown next to numbers ("kg", "°P"). */
  symbol: string;
  /** Typical decimals when showing a value in this unit. */
  decimals: number;
  /** Extra spellings accepted when typing ("lbs", "pound"). Matched case-insensitively. */
  aliases?: string[];
  toCanonical(value: number): number;
  fromCanonical(value: number): number;
}

const linear = (id: string, symbol: string, factor: number, decimals: number, aliases: string[] = []): UnitDef => ({
  id,
  symbol,
  decimals,
  aliases,
  toCanonical: (v) => v * factor,
  fromCanonical: (v) => v / factor,
});

// ---- Gravity: SG is canonical. Plato and Brix use the ASBC polynomial (Brix treated as Plato
// here; refractometer readings of fermenting wort need the correction in @brew/brewcalc).
export const sgToPlato = (sg: number) => -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
export const platoToSg = (p: number) => 1 + p / (258.6 - (p / 258.2) * 227.1);

// ---- Colour: EBC is canonical. SRM = EBC / 1.97; Lovibond from SRM by the Morey/Daniels relation.
export const ebcToSrm = (ebc: number) => ebc / 1.97;
export const srmToEbc = (srm: number) => srm * 1.97;
export const lovibondToSrm = (l: number) => 1.3546 * l - 0.76;
export const srmToLovibond = (srm: number) => (srm + 0.76) / 1.3546;

const LB = 0.45359237;
const OZ = LB / 16;
const GAL = 3.785411784;

export const UNITS: Record<Dimension, UnitDef[]> = {
  mass: [
    linear('kg', 'kg', 1, 3, ['kilo', 'kilos', 'kilogram', 'kilograms']),
    linear('g', 'g', 0.001, 1, ['gram', 'grams', 'gr']),
    linear('mg', 'mg', 1e-6, 0, []),
    linear('lb', 'lb', LB, 2, ['lbs', 'pound', 'pounds', '#']),
    linear('oz', 'oz', OZ, 2, ['ounce', 'ounces']),
  ],
  volume: [
    linear('l', 'L', 1, 2, ['liter', 'liters', 'litre', 'litres', 'ltr']),
    linear('ml', 'ml', 0.001, 0, ['milliliter', 'milliliters']),
    linear('hl', 'hl', 100, 2, ['hectoliter', 'hectolitre']),
    linear('gal', 'gal', GAL, 2, ['gallon', 'gallons', 'usgal']),
    linear('qt', 'qt', GAL / 4, 2, ['quart', 'quarts']),
    linear('floz', 'fl oz', GAL / 128, 1, ['fl oz', 'fl.oz', 'fluid ounce']),
    linear('tsp', 'tsp', 0.00492892159375, 1, ['teaspoon', 'teaspoons']),
    linear('tbsp', 'tbsp', 0.01478676478125, 1, ['tablespoon', 'tablespoons']),
    linear('igal', 'imp gal', 4.54609, 2, ['imperial gallon', 'uk gal']),
    linear('bbl', 'bbl', 117.347765304, 2, ['barrel', 'barrels']),
  ],
  temperature: [
    { id: 'c', symbol: '°C', decimals: 1, aliases: ['°c', 'celsius', 'deg c'], toCanonical: (v) => v, fromCanonical: (v) => v },
    {
      id: 'f',
      symbol: '°F',
      decimals: 1,
      aliases: ['°f', 'fahrenheit', 'deg f'],
      toCanonical: (v) => ((v - 32) * 5) / 9,
      fromCanonical: (v) => (v * 9) / 5 + 32,
    },
  ],
  gravity: [
    { id: 'sg', symbol: 'SG', decimals: 3, aliases: ['og', 'fg'], toCanonical: (v) => v, fromCanonical: (v) => v },
    { id: 'plato', symbol: '°P', decimals: 1, aliases: ['°p', 'p', 'plato'], toCanonical: platoToSg, fromCanonical: sgToPlato },
    { id: 'brix', symbol: '°Bx', decimals: 1, aliases: ['bx', '°bx', 'brix'], toCanonical: platoToSg, fromCanonical: sgToPlato },
  ],
  color: [
    { id: 'ebc', symbol: 'EBC', decimals: 1, toCanonical: (v) => v, fromCanonical: (v) => v },
    { id: 'srm', symbol: 'SRM', decimals: 1, toCanonical: srmToEbc, fromCanonical: ebcToSrm },
    {
      id: 'lovibond',
      symbol: '°L',
      decimals: 1,
      aliases: ['l', '°l', 'lovi', 'lovibond'],
      toCanonical: (v) => srmToEbc(lovibondToSrm(v)),
      fromCanonical: (v) => srmToLovibond(ebcToSrm(v)),
    },
  ],
  time: [
    linear('min', 'min', 1, 0, ['m', 'mins', 'minute', 'minutes']),
    linear('h', 'h', 60, 1, ['hr', 'hrs', 'hour', 'hours']),
    linear('d', 'd', 1440, 1, ['day', 'days']),
    linear('wk', 'wk', 10080, 1, ['w', 'week', 'weeks']),
    linear('s', 's', 1 / 60, 0, ['sec', 'secs', 'second', 'seconds']),
  ],
  pressure: [
    linear('bar', 'bar', 1, 2, []),
    linear('psi', 'psi', 0.0689475729, 1, []),
    linear('kpa', 'kPa', 0.01, 0, []),
  ],
  carbonation: [
    linear('vols', 'vol', 1, 2, ['vol', 'volumes', 'v']),
    // 1 volume of CO2 is ~1.976 g/L at standard conditions.
    linear('gl', 'g/L', 1 / 1.976, 1, ['g/l']),
  ],
  diastaticPower: [
    { id: 'lintner', symbol: '°Lintner', decimals: 0, aliases: ['°l', 'lintner'], toCanonical: (v) => v, fromCanonical: (v) => v },
    { id: 'wk', symbol: '°WK', decimals: 0, aliases: ['wk', 'windisch-kolbach'], toCanonical: (v) => (v + 16) / 3.5, fromCanonical: (v) => 3.5 * v - 16 },
  ],
  /** Mash thickness and grain absorption: water volume per grain mass. */
  specificVolume: [
    linear('lkg', 'L/kg', 1, 2, ['l/kg']),
    linear('qtlb', 'qt/lb', GAL / 4 / LB, 2, ['qt/lb']),
    linear('gallb', 'gal/lb', GAL / LB, 3, ['gal/lb']),
  ],
  /** Boil-off and similar: volume per hour. */
  rate: [linear('lh', 'L/h', 1, 2, ['l/h', 'l/hr']), linear('galh', 'gal/h', GAL, 2, ['gal/h', 'gal/hr'])],
};

export const CANONICAL: Record<Dimension, string> = Object.fromEntries(
  Object.entries(UNITS).map(([dim, units]) => [dim, units[0]!.id]),
) as Record<Dimension, string>;

export function findUnit(dimension: Dimension, id: string): UnitDef | undefined {
  return UNITS[dimension].find((u) => u.id === id);
}

function unitOrThrow(dimension: Dimension, id: string): UnitDef {
  const unit = findUnit(dimension, id);
  if (!unit) throw new Error(`Unknown ${dimension} unit "${id}"`);
  return unit;
}

/** Convert a value between two units of one dimension. */
export function convert(value: number, dimension: Dimension, from: string, to: string): number {
  if (from === to) return value;
  return unitOrThrow(dimension, to).fromCanonical(unitOrThrow(dimension, from).toCanonical(value));
}

export const toCanonical = (value: number, dimension: Dimension, unit: string) =>
  unitOrThrow(dimension, unit).toCanonical(value);
export const fromCanonical = (value: number, dimension: Dimension, unit: string) =>
  unitOrThrow(dimension, unit).fromCanonical(value);

/** Find a unit by id, symbol or alias as a user might type it. */
export function matchUnit(dimension: Dimension, text: string): UnitDef | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return undefined;
  return UNITS[dimension].find(
    (u) => u.id === t || u.symbol.toLowerCase() === t || (u.aliases ?? []).some((a) => a.toLowerCase() === t),
  );
}

/**
 * Parse what a user typed into a quantity: "5", "5,5", "5 lb", "12°P", "1.050". Returns the number
 * and, when a unit was typed, that unit. A bare gravity above 1.2 is read as °Plato.
 */
export function parseQuantity(dimension: Dimension, text: string): { value: number; unit?: UnitDef } | null {
  const m = /^\s*(-?\d+(?:[.,]\d*)?|-?[.,]\d+)\s*(.*?)\s*$/.exec(text);
  if (!m) return null;
  const value = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const rest = m[2] ?? '';
  if (!rest) {
    if (dimension === 'gravity' && value > 1.2) return { value, unit: findUnit('gravity', 'plato') };
    return { value };
  }
  const unit = matchUnit(dimension, rest);
  return unit ? { value, unit } : null;
}

/** Round for display/storage without float noise (1.0500000001 → 1.05). */
export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// ---- Preferences: which unit each kind of value is shown in ---------------------------------

/**
 * Kinds of values in the app. Each maps to a dimension; the user picks a unit per kind (grain
 * in kg but hops in g, for example).
 */
export const MEASURES = {
  massLarge: 'mass',
  massSmall: 'mass',
  volume: 'volume',
  volumeSmall: 'volume',
  temperature: 'temperature',
  gravity: 'gravity',
  color: 'color',
  pressure: 'pressure',
  carbonation: 'carbonation',
  diastaticPower: 'diastaticPower',
  specificVolume: 'specificVolume',
  rate: 'rate',
  timeShort: 'time',
  timeLong: 'time',
} as const satisfies Record<string, Dimension>;
export type Measure = keyof typeof MEASURES;
export type UnitPrefs = Record<Measure, string>;

export const METRIC_UNITS: UnitPrefs = {
  massLarge: 'kg',
  massSmall: 'g',
  volume: 'l',
  volumeSmall: 'ml',
  temperature: 'c',
  gravity: 'sg',
  color: 'ebc',
  pressure: 'bar',
  carbonation: 'vols',
  diastaticPower: 'wk',
  specificVolume: 'lkg',
  rate: 'lh',
  timeShort: 'min',
  timeLong: 'd',
};

export const US_UNITS: UnitPrefs = {
  massLarge: 'lb',
  massSmall: 'oz',
  volume: 'gal',
  volumeSmall: 'floz',
  temperature: 'f',
  gravity: 'sg',
  color: 'srm',
  pressure: 'psi',
  carbonation: 'vols',
  diastaticPower: 'lintner',
  specificVolume: 'qtlb',
  rate: 'galh',
  timeShort: 'min',
  timeLong: 'd',
};

/** Preferred unit for a kind of value, falling back to metric when a saved id is unknown. */
export function preferredUnit(prefs: Partial<UnitPrefs> | undefined, measure: Measure): UnitDef {
  const dimension = MEASURES[measure];
  return findUnit(dimension, prefs?.[measure] ?? '') ?? unitOrThrow(dimension, METRIC_UNITS[measure]);
}

// ---- Readable weights ----------------------------------------------------------------------------

/** One part of a weight as it is shown: "11 lb" and "6 oz" in "11 lb 6 oz". */
export interface MassPart {
  value: number;
  unit: UnitDef;
  /** Decimals worth showing for this part. */
  decimals: number;
}

const massUnit = (id: string) => unitOrThrow('mass', id);

/**
 * A weight (kg) the way people read it, starting from the unit the user prefers: "600 g" instead
 * of "0.6 kg", "1.2 kg" instead of "1200 g", "3 oz" instead of "0.19 lb", "11 lb 6 oz" instead of
 * "11.38 lb". Imperial weights of a pound or more are split into pounds and whole ounces.
 */
export function readableMass(kg: number, unitId: string): MassPart[] {
  const sign = kg < 0 ? -1 : 1;
  const abs = Math.abs(kg);
  const signed = (parts: MassPart[]) => parts.map((p, i) => (i === 0 ? { ...p, value: p.value * sign } : p));
  const metricG = (): MassPart => {
    const g = abs * 1000;
    return { value: g, unit: massUnit('g'), decimals: g < 100 ? 1 : 0 };
  };
  if (unitId === 'kg' || unitId === 'g') {
    if (abs === 0) return [{ value: 0, unit: massUnit(unitId), decimals: 0 }];
    return signed(abs < 1 ? [metricG()] : [{ value: abs, unit: massUnit('kg'), decimals: 3 }]);
  }
  if (unitId === 'lb' || unitId === 'oz') {
    const lbs = abs / LB;
    if (abs === 0) return [{ value: 0, unit: massUnit(unitId), decimals: 0 }];
    if (lbs < 1) return signed([{ value: lbs * 16, unit: massUnit('oz'), decimals: 1 }]);
    let whole = Math.floor(lbs);
    let oz = Math.round((lbs - whole) * 16);
    if (oz === 16) {
      whole += 1;
      oz = 0;
    }
    const parts: MassPart[] = [{ value: whole, unit: massUnit('lb'), decimals: 0 }];
    if (oz > 0) parts.push({ value: oz, unit: massUnit('oz'), decimals: 0 });
    return signed(parts);
  }
  const unit = findUnit('mass', unitId) ?? massUnit('kg');
  return [{ value: unit.fromCanonical(kg), unit, decimals: unit.decimals }];
}

/** The unit a weight field should open in: the smaller one for less than a kilogram or pound. */
export function readableMassUnitId(kg: number | null | undefined, unitId: string): string {
  if (kg == null || !(kg > 0)) return unitId;
  if (unitId === 'kg' && kg < 1) return 'g';
  if (unitId === 'lb' && kg / LB < 1) return 'oz';
  return unitId;
}

// ---- Readable volumes ----------------------------------------------------------------------------

const volumeUnit = (id: string) => unitOrThrow('volume', id);

/**
 * A volume (L) the way people read it, starting from the unit the user prefers: "250 ml" instead
 * of "0.25 L", "1.5 L" instead of "1500 ml", "2 qt" instead of "0.5 gal", "6 fl oz" instead of
 * "0.05 gal". Gallons stay decimal ("5.5 gal"). Other units (hl, imperial gallons, barrels, spoons)
 * are kept as they are.
 */
export function readableVolume(l: number, unitId: string): MassPart[] {
  const abs = Math.abs(l);
  const keep = (id: string): MassPart[] => {
    const unit = volumeUnit(id);
    return [{ value: unit.fromCanonical(l), unit, decimals: unit.decimals }];
  };
  if (abs === 0) return keep(findUnit('volume', unitId) ? unitId : 'l');
  if (unitId === 'l' || unitId === 'ml') {
    if (abs >= 1) return keep('l');
    const ml = l * 1000;
    return [{ value: ml, unit: volumeUnit('ml'), decimals: Math.abs(ml) < 10 ? 1 : 0 }];
  }
  if (unitId === 'gal' || unitId === 'qt' || unitId === 'floz') {
    const gal = abs / GAL;
    if (gal >= 1) return keep('gal');
    if (gal * 4 >= 1) return [{ value: (l / GAL) * 4, unit: volumeUnit('qt'), decimals: 1 }];
    const floz = (l / GAL) * 128;
    return [{ value: floz, unit: volumeUnit('floz'), decimals: Math.abs(floz) < 1 ? 2 : 1 }];
  }
  return keep(findUnit('volume', unitId) ? unitId : 'l');
}

/** The unit a volume field should open in: millilitres below a litre; quarts or fl oz below a gallon. */
export function readableVolumeUnitId(l: number | null | undefined, unitId: string): string {
  if (l == null || !(l > 0)) return unitId;
  if (unitId === 'l' && l < 1) return 'ml';
  if (unitId === 'gal' && l / GAL < 1) return (l / GAL) * 4 >= 1 ? 'qt' : 'floz';
  return unitId;
}

/** Readable parts of a weight or volume (other dimensions: null, shown as they are). */
export function readableQuantity(dimension: Dimension, value: number, unitId: string): MassPart[] | null {
  if (dimension === 'mass') return readableMass(value, unitId);
  if (dimension === 'volume') return readableVolume(value, unitId);
  return null;
}

/** The unit a field of this dimension should open in for `value` (weights and volumes only). */
export function readableUnitId(dimension: Dimension, value: number | null | undefined, unitId: string): string {
  if (dimension === 'mass') return readableMassUnitId(value, unitId);
  if (dimension === 'volume') return readableVolumeUnitId(value, unitId);
  return unitId;
}

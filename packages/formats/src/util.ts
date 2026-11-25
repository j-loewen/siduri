import { platoToSg, srmToEbc, lovibondToSrm } from '@brew/shared';

/** Parsed JSON / XML of unknown shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type J = any;

export const newId = () => crypto.randomUUID();

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const arr = (v: unknown): J[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
export const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');

export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

// ---- BeerJSON units → canonical --------------------------------------------------------------

const VOLUME_L: Record<string, number> = {
  ml: 0.001,
  l: 1,
  tsp: 0.00492892159375,
  tbsp: 0.01478676478125,
  floz: 0.0295735295625,
  cup: 0.2365882365,
  pt: 0.473176473,
  qt: 0.946352946,
  gal: 3.785411784,
  bbl: 117.347765304,
  ifloz: 0.0284130625,
  ipt: 0.56826125,
  iqt: 1.1365225,
  igal: 4.54609,
  ibbl: 163.65924,
};
const MASS_KG: Record<string, number> = { mg: 1e-6, g: 0.001, kg: 1, lb: 0.45359237, oz: 0.028349523125 };
const TIME_MIN: Record<string, number> = { sec: 1 / 60, min: 1, hr: 60, day: 1440, week: 10080 };
const SPECIFIC_VOLUME_L_PER_KG: Record<string, number> = {
  'l/kg': 1,
  'l/g': 1000,
  'qt/lb': 0.946352946 / 0.45359237,
  'gal/lb': 3.785411784 / 0.45359237,
  'gal/oz': 3.785411784 / 0.028349523125,
  'floz/oz': 0.0295735295625 / 0.028349523125,
  'm^3/kg': 1000,
  'ft^3/lb': 28.316846592 / 0.45359237,
};
const COUNT_UNITS = new Set(['1', 'unit', 'each', 'dimensionless', 'pkg']);

export type Quantity = { kind: 'mass'; kg: number } | { kind: 'volume'; l: number } | { kind: 'count'; n: number };

/** A BeerJSON {unit, value} amount as mass, volume or count. */
export function quantity(q: J): Quantity | null {
  if (!isObj(q)) return null;
  const value = num(q.value);
  const unit = str(q.unit);
  if (value === null) return null;
  if (unit in MASS_KG) return { kind: 'mass', kg: value * MASS_KG[unit]! };
  if (unit in VOLUME_L) return { kind: 'volume', l: value * VOLUME_L[unit]! };
  if (COUNT_UNITS.has(unit)) return { kind: 'count', n: value };
  return null;
}

/** Read a BeerJSON measurement into this app's canonical unit, or null. */
export function bj(q: J, dimension: 'mass' | 'volume' | 'time' | 'temperature' | 'color' | 'gravity' | 'percent' | 'specificVolume' | 'concentration' | 'carbonation' | 'diastaticPower' | 'bitterness'): number | null {
  if (!isObj(q)) return null;
  const value = num(q.value);
  const unit = str(q.unit);
  if (value === null) return null;
  switch (dimension) {
    case 'mass':
      return unit in MASS_KG ? value * MASS_KG[unit]! : null;
    case 'volume':
      return unit in VOLUME_L ? value * VOLUME_L[unit]! : null;
    case 'time':
      return unit in TIME_MIN ? value * TIME_MIN[unit]! : null;
    case 'temperature':
      return unit === 'F' ? ((value - 32) * 5) / 9 : value;
    case 'color':
      if (unit === 'EBC') return value;
      if (unit === 'SRM') return srmToEbc(value);
      if (unit === 'Lovi') return srmToEbc(Math.max(0, lovibondToSrm(value)));
      return null;
    case 'gravity':
      if (unit === 'sg') return value;
      if (unit === 'plato' || unit === 'brix') return platoToSg(value);
      return null;
    case 'specificVolume':
      return unit in SPECIFIC_VOLUME_L_PER_KG ? value * SPECIFIC_VOLUME_L_PER_KG[unit]! : null;
    case 'concentration':
      return unit === 'ppb' ? value / 1000 : value;
    case 'carbonation':
      return unit === 'g/l' ? value / 1.976 : value;
    case 'diastaticPower':
      return unit === 'WK' ? (value + 16) / 3.5 : value;
    case 'percent':
    case 'bitterness':
      return value;
  }
}

/** A BeerJSON {minimum, maximum} range into a [min, max] tuple. */
export function bjRange(r: J, dimension: Parameters<typeof bj>[1]): [number | null, number | null] {
  if (!isObj(r)) return [null, null];
  return [bj(r.minimum, dimension), bj(r.maximum, dimension)];
}

// ---- Canonical → BeerJSON ------------------------------------------------------------------------

export const q = (value: number, unit: string) => ({ unit, value: round(value) });

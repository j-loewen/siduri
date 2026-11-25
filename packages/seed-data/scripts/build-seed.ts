/**
 * Builds the bundled ingredient library (src/data/*.json) from Wall Brew Co's common-beer-data
 * (MIT licence, https://github.com/Wall-Brew-Co/common-beer-data), converting its BeerXML-style
 * values (°Lovibond, SRM, fractions) into this app's canonical units.
 *
 *   git clone --depth 1 https://github.com/Wall-Brew-Co/common-beer-data <dir>
 *   npm run seed:build -- <dir>
 *
 * The output is committed; this only needs to run when updating the seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lovibondToSrm,
  parseLibraryData,
  srmToEbc,
  type CultureData,
  type FermentableData,
  type HopData,
  type LibraryKind,
  type StyleData,
} from '@brew/shared';

const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run seed:build -- <path to a common-beer-data clone>');
  process.exit(1);
}
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
type Raw = Record<string, unknown>;

function read(file: string): Raw[] {
  const json = JSON.parse(fs.readFileSync(path.join(source!, 'exports', 'json', `${file}.json`), 'utf8')) as Record<string, Raw[]>;
  return Object.values(json)[0]!.map((wrapper) => Object.values(wrapper)[0] as Raw);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const pct = (v: unknown, scale = 100): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n * scale * 100) / 100;
};
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function slug(s: string) {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface SeedItem<T> {
  seedKey: string;
  data: T;
}

function keyed<T extends { name: string }>(kind: LibraryKind, items: T[]): SeedItem<T>[] {
  const seen = new Map<string, number>();
  return items.map((data) => {
    const base = `${kind}:${slug(data.name)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { seedKey: n === 1 ? base : `${base}-${n}`, data: parseLibraryData(kind, data) as unknown as T };
  });
}

// ---- Fermentables
const FERMENTABLE_TYPE: Record<string, FermentableData['type']> = {
  Grain: 'grain',
  Sugar: 'sugar',
  Extract: 'extract',
  'Dry Extract': 'dry_extract',
  Adjunct: 'adjunct',
};

function grainGroup(name: string, type: FermentableData['type'], colorEbc: number): FermentableData['grainGroup'] {
  if (type !== 'grain') return type === 'adjunct' ? 'adjunct' : null;
  if (/smoke|rauch|peat/i.test(name)) return 'smoked';
  if (/crystal|caramel|cara|special b/i.test(name)) return 'caramel';
  if (/black|chocolate|roast|carafa|coffee/i.test(name)) return 'roasted';
  if (colorEbc <= 15) return 'base';
  return 'specialty';
}

const fermentables = keyed(
  'fermentable',
  read('fermentables').map((r): Partial<FermentableData> & { name: string } => {
    const name = str(r.name);
    const type = FERMENTABLE_TYPE[str(r.type)] ?? 'other';
    const lovibond = num(r.color) ?? 0;
    // BeerXML colour is °Lovibond for grain and SRM for everything else.
    const colorEbc = round(type === 'grain' ? srmToEbc(Math.max(0, lovibondToSrm(lovibond))) : srmToEbc(lovibond), 1);
    return {
      name,
      type,
      grainGroup: grainGroup(name, type, colorEbc),
      colorEbc,
      potentialSg: num(r.potential) ?? 1 + (num(r.yield) ?? 0.75) * 0.046,
      fermentability: /lactose|maltodextrin/i.test(name) ? 0 : 1,
      moisturePct: pct(r.moisture),
      proteinPct: pct(r.protein),
      diastaticPower: num(r['diastatic-power']),
      maxInBatchPct: pct(r['max-in-batch']),
      recommendMash: r['recommend-mash'] === true,
      notes: str(r.notes),
    };
  }),
);

// ---- Hops
const HOP_PURPOSE: Record<string, HopData['purpose']> = { Bittering: 'bittering', Aroma: 'aroma', Both: 'dual' };
const hops = keyed(
  'hop',
  read('hops').map((r): Partial<HopData> & { name: string } => ({
    name: str(r.name),
    form: str(r.form).toLowerCase() === 'leaf' ? 'leaf' : 'pellet',
    purpose: HOP_PURPOSE[str(r.type)] ?? null,
    alphaPct: pct(r.alpha) ?? 5,
    betaPct: pct(r.beta),
    cohumulonePct: pct(r.cohumulone),
    hsi: num(r.hsi),
    substitutes: str(r.substitutes),
    notes: str(r.notes),
  })),
);

// ---- Cultures
const FLOC: Record<string, CultureData['flocculation']> = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  'Very High': 'very_high',
};
const cultures = keyed(
  'culture',
  read('yeasts').map((r): Partial<CultureData> & { name: string } => {
    const att = pct(r.attenuation);
    return {
      name: str(r.name),
      producer: str(r.laboratory).replace('DCL/Fermentis', 'Fermentis'),
      productId: str(r['product-id']),
      type: (str(r.type).toLowerCase() as CultureData['type']) || 'ale',
      form: str(r.form).toLowerCase() === 'liquid' ? 'liquid' : 'dry',
      attenuationMinPct: att,
      attenuationMaxPct: att,
      tempMinC: num(r['min-temperature']) === null ? null : round(num(r['min-temperature'])!, 1),
      tempMaxC: num(r['max-temperature']) === null ? null : round(num(r['max-temperature'])!, 1),
      flocculation: FLOC[str(r.flocculation)] ?? null,
      bestFor: str(r['best-for']),
      notes: str(r.notes),
    };
  }),
);

// ---- Styles
const range = (lo: unknown, hi: unknown, f: (n: number) => number = (n) => n): [number | null, number | null] => [
  num(lo) === null ? null : round(f(num(lo)!), 4),
  num(hi) === null ? null : round(f(num(hi)!), 4),
];
const styles = keyed(
  'style',
  read('styles').map((r): Partial<StyleData> & { name: string } => ({
    name: str(r.name),
    guide: str(r['style-guide']),
    category: str(r.category),
    categoryNumber: str(r['category-number']),
    styleLetter: str(r['style-letter']),
    type: (str(r.type).toLowerCase() as StyleData['type']) || 'beer',
    og: range(r['og-min'], r['og-max']),
    fg: range(r['fg-min'], r['fg-max']),
    ibu: range(r['ibu-min'], r['ibu-max']),
    colorEbc: range(r['color-min'], r['color-max'], (srm) => round(srmToEbc(srm), 1)),
    abvPct: range(r['abv-min'], r['abv-max'], (f) => f * 100),
    carbVols: range(r['carb-min'], r['carb-max']),
    notes: str(r.notes),
    profile: str(r.profile),
    ingredients: str(r.ingredients),
    examples: str(r.examples),
  })),
);

fs.mkdirSync(outDir, { recursive: true });
for (const [file, items] of Object.entries({ fermentables, hops, cultures, styles })) {
  fs.writeFileSync(path.join(outDir, `${file}.json`), JSON.stringify(items, null, 1) + '\n');
  console.log(`${file}: ${items.length}`);
}

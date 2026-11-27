/**
 * Builds the bundled library (src/data/*.json) from open-brewing-data (ODbL,
 * https://github.com/j-loewen/open-brewing-data), converting its values into this app's
 * canonical units. The seed key of each item is its open-brewing-data id.
 *
 *   npm run seed:build
 *
 * The output is committed; run this after bumping the pinned open-brewing-data version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as obd from 'open-brewing-data';
import {
  GENERIC_PRODUCER,
  parseLibraryData,
  platoToSg,
  toCanonical,
  type CultureData,
  type FermentableData,
  type HopData,
  type LibraryKind,
  type MiscData,
  type StyleData,
} from '@brew/shared';

type Range = { min?: number; max?: number; typical?: number; unit: string };
type Entry = { id: string; name: string; aliases?: string[]; description?: string; producer?: string | null; discontinued?: boolean };

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** One number for a range: the typical value, else the middle, else whichever end is known. */
function val(r: Range | undefined, prefer?: 'min' | 'max'): number | null {
  if (!r) return null;
  if (prefer && r[prefer] != null) return r[prefer]!;
  if (r.typical != null) return r.typical;
  if (r.min != null && r.max != null) return (r.min + r.max) / 2;
  return r.min ?? r.max ?? null;
}
const lo = (r: Range | undefined) => (r ? (r.min ?? r.typical ?? null) : null);
const hi = (r: Range | undefined) => (r ? (r.max ?? r.typical ?? null) : null);
const opt = (n: number | null, d = 2) => (n == null ? null : round(n, d));
const pct = (r: Range | undefined, prefer?: 'min' | 'max') => {
  const n = val(r, prefer);
  return n == null ? null : round(clamp(n, 0, 100), 2);
};
const sg = (v: number | null, unit: string | undefined) => (v == null ? null : round(unit === 'plato' ? platoToSg(v) : v, 4));

const producerName = new Map(obd.producers.map((p) => [p.slug, p.name]));
/** The producer's name; generic entries (`fermentables/generic/…`) are made by "Generic". */
const producerOf = (e: Entry) =>
  e.producer ? (producerName.get(e.producer) ?? e.producer) : e.id.split('/')[1] === 'generic' ? GENERIC_PRODUCER : '';
const common = (e: Entry) => ({ name: e.name, aliases: e.aliases ?? [], notes: e.description ?? '' });

// ---- Fermentables

const FERMENTABLE_TYPE: Record<string, FermentableData['type']> = { 'dry extract': 'dry_extract' };

/** For entries without a group (most generic ones), guessed from the name and colour. */
function guessGrainGroup(name: string, colorEbc: number): FermentableData['grainGroup'] {
  if (/smoke|rauch|peat/i.test(name)) return 'smoked';
  if (/flaked|torrefied|raw|unmalted/i.test(name)) return 'flaked';
  if (/crystal|caramel|cara|special b/i.test(name)) return 'caramel';
  if (/black|chocolate|roast|carafa|coffee/i.test(name)) return 'roasted';
  return colorEbc <= 15 ? 'base' : 'specialty';
}

/** Gravity of 1 lb in 1 US gal from the extract (fine grind, dry basis). 46.21 PPG = sucrose. */
function potentialOf(f: obd.Fermentable): number | null {
  const p = val(f.potential);
  if (p != null) return sg(p, f.potential?.unit);
  const y = val(f.yield_fine_grind) ?? val(f.yield_coarse_grind);
  return y == null ? null : round(1 + (y / 100) * 0.04621, 4);
}
const genericPotential = new Map(obd.fermentables.filter((f) => !f.producer).map((f) => [f.id, potentialOf(f)]));

function lintner(r: Range | undefined): number | null {
  const n = val(r);
  if (n == null) return null;
  return round(clamp(r!.unit === 'WK' ? (n + 16) / 3.5 : n, 0, 500), 0);
}

const fermentables = obd.fermentables.map((f) => {
  const type = FERMENTABLE_TYPE[f.type] ?? (f.type as FermentableData['type']);
  const colorEbc = round(val(f.color_ebc) ?? 0, 1);
  const grainGroup = (f.grain_group as FermentableData['grainGroup'] | undefined) ?? (type === 'grain' ? guessGrainGroup(f.name, colorEbc) : null);
  const potentialSg = potentialOf(f) ?? (f.generic_id ? genericPotential.get(f.generic_id) : null) ?? undefined;
  const data: Partial<FermentableData> = {
    ...common(f),
    type,
    grainGroup,
    producer: producerOf(f),
    origin: f.country ?? '',
    productId: f.product_id ?? '',
    colorEbc,
    ...(potentialSg != null && { potentialSg: clamp(potentialSg, 1, 1.05) }),
    fermentability: /lactose|maltodextrin/i.test(f.name) ? 0 : 1,
    moisturePct: pct(f.moisture, 'max'),
    proteinPct: pct(f.protein),
    diastaticPower: lintner(f.diastatic_power),
    maxInBatchPct: pct(f.max_in_batch, 'max'),
    recommendMash: f.recommend_mash ?? (type === 'grain' && grainGroup !== 'caramel' && grainGroup !== 'roasted'),
  };
  return item('fermentable', f, data);
});

// ---- Hops

function purpose(type: string | undefined): HopData['purpose'] {
  if (!type) return null;
  const bitter = type.includes('bittering');
  const aroma = type.includes('aroma') || type.includes('flavor');
  return bitter && aroma ? 'dual' : bitter ? 'bittering' : 'aroma';
}
const HOP_FORM: Record<string, HopData['form']> = { leaf: 'leaf', 'leaf (wet)': 'leaf', pellet: 'pellet', powder: 'pellet', plug: 'plug', extract: 'extract' };
const hopName = new Map(obd.hops.filter((h) => !h.producer).map((h) => [h.slug, h.name]));

const hops = obd.hops.map((h) => {
  const storageLoss = val(h.storage_loss);
  const data: Partial<HopData> = {
    ...common(h),
    producer: producerOf(h),
    origin: h.country ?? '',
    form: (h.form && HOP_FORM[h.form]) || 'pellet',
    purpose: purpose(h.type),
    alphaPct: pct(h.alpha_acid) ?? 5,
    betaPct: pct(h.beta_acid),
    cohumulonePct: pct(h.cohumulone),
    totalOil: opt(val(h.total_oil) == null ? null : clamp(val(h.total_oil)!, 0, 20)),
    hsi: storageLoss == null ? null : round(clamp(storageLoss / 100, 0, 1), 2),
    substitutes: (h.substitutes ?? []).map((s) => hopName.get(s) ?? s).join(', '),
  };
  return item('hop', h, data);
});

// ---- Cultures

const CULTURE_TYPE: Record<string, CultureData['type']> = { 'mixed-culture': 'mixed', spontaneous: 'mixed', bacteria: 'other', malolactic: 'other' };
const FLOC: Record<string, CultureData['flocculation']> = {
  'very low': 'very_low',
  low: 'low',
  'medium low': 'low',
  medium: 'medium',
  'medium high': 'high',
  high: 'high',
  'very high': 'very_high',
};
const celsius = (n: number | null, unit: string | undefined) => (n == null ? null : round(clamp(unit === 'F' ? ((n - 32) * 5) / 9 : n, -5, 50), 1));

const cultures = obd.cultures.map((c) => {
  const data: Partial<CultureData> = {
    ...common(c),
    producer: producerOf(c),
    productId: c.product_id ?? '',
    type: CULTURE_TYPE[c.type] ?? (c.type as CultureData['type']),
    form: c.form,
    attenuationMinPct: opt(lo(c.attenuation) == null ? null : clamp(lo(c.attenuation)!, 0, 100)),
    attenuationMaxPct: opt(hi(c.attenuation) == null ? null : clamp(hi(c.attenuation)!, 0, 100)),
    tempMinC: celsius(lo(c.temperature), c.temperature?.unit),
    tempMaxC: celsius(hi(c.temperature), c.temperature?.unit),
    flocculation: (c.flocculation && FLOC[c.flocculation]) || null,
    alcoholTolerancePct: pct(c.alcohol_tolerance, 'max'),
  };
  return item('culture', c, data);
});

// ---- Styles

const guideName = new Map(obd.styleGuides.map((g) => [g.slug, /^(.*?\d{4})/.exec(g.name)?.[1] ?? g.name]));
const STYLE_TYPE: Record<string, StyleData['type']> = { cider: 'cider', mead: 'mead', wine: 'wine' };
const range = (r: Range | undefined, f: (n: number) => number = (n) => n, d = 4): StyleData['og'] => [
  lo(r) == null ? null : round(f(lo(r)!), d),
  hi(r) == null ? null : round(f(hi(r)!), d),
];

const styles = obd.styles.map((s) => {
  const data: Partial<StyleData> = {
    name: s.name,
    aliases: s.aliases ?? [],
    guide: guideName.get(s.style_guide) ?? s.style_guide,
    category: s.category,
    categoryNumber: s.category_number == null ? '' : String(s.category_number),
    styleLetter: s.style_letter ?? '',
    type: s.type === 'beer' ? (s.fermentation === 'other' || !s.fermentation ? 'beer' : s.fermentation) : (STYLE_TYPE[s.type] ?? 'other'),
    og: range(s.original_gravity, (n) => sg(n, s.original_gravity?.unit)!),
    fg: range(s.final_gravity, (n) => sg(n, s.final_gravity?.unit)!),
    ibu: range(s.bitterness, (n) => n, 1),
    colorEbc: range(s.color_ebc, (n) => n, 1),
    abvPct: range(s.abv, (n) => n, 2),
    carbVols: range(s.carbonation, (n) => (s.carbonation?.unit === 'g/l' ? toCanonical(n, 'carbonation', 'gl') : n), 2),
  };
  return item('style', s, data);
});

// ---- Other ingredients: Siduri keeps its own generic list (src/miscs.ts); only producer products come from here.

const MISC_TYPE: Record<string, MiscData['type']> = { 'water agent': 'water_agent' };
const miscs = obd.miscs
  .filter((m) => m.producer)
  .map((m) => {
    const data: Partial<MiscData> = {
      ...common(m),
      type: MISC_TYPE[m.type] ?? (m.type as MiscData['type']),
      producer: producerOf(m),
      productId: m.product_id ?? '',
      amountKind: 'mass',
      useFor: m.use_for ?? '',
    };
    return item('misc', m, data);
  });

// ---- Substitutes: products of the same generic malt; hop varieties the data lists as substitutes.

const substitutes: Record<string, string[]> = {};
const byGeneric = new Map<string, string[]>();
for (const f of obd.fermentables) if (f.generic_id) byGeneric.set(f.generic_id, [...(byGeneric.get(f.generic_id) ?? []), f.id]);
for (const [generic, products] of byGeneric) {
  for (const id of [generic, ...products]) {
    const others = [generic, ...products].filter((o) => o !== id);
    if (others.length) substitutes[id] = others;
  }
}
const hopIds = new Set(obd.hops.map((h) => h.id));
for (const h of obd.hops) {
  const subs = (h.substitutes ?? []).map((s) => `hops/varieties/${s}`).filter((id) => hopIds.has(id) && id !== h.id);
  if (subs.length) substitutes[h.id] = [...new Set([...(substitutes[h.id] ?? []), ...subs])];
}

// ---- Renamed ids: entries may list the ids they had before (`former_ids`).

const renamed: Record<string, string> = {};
for (const e of [...obd.fermentables, ...obd.hops, ...obd.cultures, ...obd.miscs, ...obd.styles] as (Entry & { former_ids?: unknown })[]) {
  if (Array.isArray(e.former_ids)) for (const old of e.former_ids) if (typeof old === 'string') renamed[old] = e.id;
}

// ---- Output

interface SeedItem {
  seedKey: string;
  data: unknown;
}

function item(kind: LibraryKind, e: Entry, data: object): SeedItem {
  try {
    return { seedKey: e.id, data: parseLibraryData(kind, data) };
  } catch (err) {
    throw new Error(`${e.id}: ${(err as Error).message}`);
  }
}

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('open-brewing-data/package.json'));
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(outDir, file), JSON.stringify(value, null, 1) + '\n');

fs.mkdirSync(outDir, { recursive: true });
for (const [file, items] of Object.entries({ fermentables, hops, cultures, styles, miscs })) {
  // Stable order, so a data update shows as a small diff.
  items.sort((a, b) => (a.seedKey < b.seedKey ? -1 : 1));
  write(`${file}.json`, items);
  console.log(`${file}: ${items.length}`);
}
write('substitutes.json', Object.fromEntries(Object.entries(substitutes).sort(([a], [b]) => (a < b ? -1 : 1))));
write('renamed.json', renamed);
write('meta.json', { version: obd.meta.version, attribution: obd.meta.attribution, licenseUrl: obd.meta.license_url });
for (const file of ['LICENSE-DATA', 'NOTICE.md']) fs.copyFileSync(path.join(pkgDir, file), path.join(outDir, file));

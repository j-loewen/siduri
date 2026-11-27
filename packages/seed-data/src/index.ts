import type { LibraryDataMap, LibraryKind } from '@brew/shared';
import cultures from './data/cultures.json';
import fermentables from './data/fermentables.json';
import hops from './data/hops.json';
import legacy from './data/legacy-keys.json';
import meta from './data/meta.json';
import obdMiscs from './data/miscs.json';
import renamed from './data/renamed.json';
import styles from './data/styles.json';
import substitutes from './data/substitutes.json';
import { MISCS } from './miscs';
import { WATER_PROFILES } from './water';

/**
 * The built-in library. Fermentables, hops, cultures, styles and producer miscs come from
 * open-brewing-data (seed key = its id, built by scripts/build-seed.ts); the generic other
 * ingredients and the water profiles are Siduri's own (`misc:…`, `water:…`). Built-in items are
 * read-only in the app and follow this data: the server syncs them on every start.
 */
export const SEED_DATA = { name: 'open-brewing-data', version: meta.version, url: 'https://github.com/j-loewen/open-brewing-data' };
export const SEED_ATTRIBUTION = meta.attribution;

export type SeedItem = { [K in LibraryKind]: { kind: K; seedKey: string; data: LibraryDataMap[K] } }[LibraryKind];

const tag = <K extends LibraryKind>(kind: K, items: { seedKey: string; data: unknown }[]) =>
  items.map((i) => ({ kind, seedKey: i.seedKey, data: i.data as LibraryDataMap[K] }));

export const SEED_ITEMS: SeedItem[] = [
  ...tag('fermentable', fermentables),
  ...tag('hop', hops),
  ...tag('culture', cultures),
  ...tag('style', styles),
  ...tag('water', WATER_PROFILES),
  ...tag('misc', MISCS),
  ...tag('misc', obdMiscs),
];

const byKey = new Map(SEED_ITEMS.map((i) => [i.seedKey, i]));
export const seedItem = (seedKey: string) => byKey.get(seedKey);

const substituteMap = substitutes as Record<string, string[]>;
/** Seed keys of items that can replace this one (other producers' versions of the same malt, hop substitutes). */
export const substitutesOf = (seedKey: string): string[] => substituteMap[seedKey] ?? [];

/**
 * Keys of the library Siduri 1.0 shipped before open-brewing-data: old key → new
 * key, and a hash of the old values over `fields`, to tell unedited items from edited ones.
 */
export const LEGACY_SEED_KEYS = legacy.keys as Record<string, { key: string; hash: string }>;
export const LEGACY_SEED_FIELDS = legacy.fields as Partial<Record<LibraryKind, string[]>>;

/** Ids open-brewing-data renamed: old id → current id. */
export const RENAMED_SEED_KEYS = renamed as Record<string, string>;

/** Current key for a key from an older library (or the key itself). */
export function currentSeedKey(seedKey: string): string {
  const key = LEGACY_SEED_KEYS[seedKey]?.key ?? seedKey;
  return RENAMED_SEED_KEYS[key] ?? key;
}

export { seedDataHash, stableStringify } from './hash';
export { WATER_PROFILES };

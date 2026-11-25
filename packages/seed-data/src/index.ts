import type { LibraryDataMap, LibraryKind } from '@brew/shared';
import cultures from './data/cultures.json';
import fermentables from './data/fermentables.json';
import hops from './data/hops.json';
import styles from './data/styles.json';
import { MISCS } from './miscs';
import { WATER_PROFILES } from './water';

/**
 * The library the app starts with. Bump SEED_VERSION when the data changes: on start the server
 * adds items whose seedKey it has not seen yet, and never overwrites items the user edited.
 */
export const SEED_VERSION = 2;

export const SEED_ATTRIBUTION =
  'Fermentables, hops, yeasts and BJCP 2015 styles from common-beer-data by Wall Brew Co (MIT licence).';

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
];

const byKey = new Map(SEED_ITEMS.map((i) => [i.seedKey, i]));
export const seedItem = (seedKey: string) => byKey.get(seedKey);

export { WATER_PROFILES };

import { describe, expect, it } from 'vitest';
import { LIBRARY_SCHEMAS, parseLibraryData } from '@brew/shared';
import { LEGACY_SEED_KEYS, SEED_ITEMS, currentSeedKey, seedDataHash, seedItem, substitutesOf } from '../src';

const data = (key: string) => seedItem(key)!.data as unknown as Record<string, unknown>;

describe('seed data', () => {
  it('every item is valid and keys are unique', () => {
    const keys = new Set<string>();
    for (const item of SEED_ITEMS) {
      expect(() => LIBRARY_SCHEMAS[item.kind].parse(item.data), item.seedKey).not.toThrow();
      expect(keys.has(item.seedKey), item.seedKey).toBe(false);
      keys.add(item.seedKey);
    }
    expect(SEED_ITEMS.filter((i) => i.kind === 'fermentable').length).toBeGreaterThan(500);
  });

  it('is stored as parsed, so the server can compare it with stored rows', () => {
    for (const item of SEED_ITEMS) {
      expect(seedDataHash(parseLibraryData(item.kind, item.data) as never), item.seedKey).toBe(seedDataHash(item.data as never));
    }
  });

  it('converts open-brewing-data into canonical units', () => {
    expect(data('fermentables/weyermann/caramunich-type-3')).toMatchObject({
      name: 'CARAMUNICH Type 3',
      producer: 'Weyermann',
      origin: 'Germany',
      colorEbc: 150,
      grainGroup: 'caramel',
      aliases: expect.arrayContaining(['CARAMUNICH III']),
    });
    // Diastatic power given in °WK is stored in °Lintner.
    expect(data('fermentables/weyermann/diastatic-barley-malt').diastaticPower).toBe(90);
    // Generic malts are made by "Generic"; hop varieties have no producer.
    expect(data('fermentables/generic/caramunich-malt')).toMatchObject({ producer: 'Generic' });
    expect(data('hops/varieties/cascade')).toMatchObject({ producer: '' });
    expect(data('cultures/fermentis/safale-us-05')).toMatchObject({ producer: 'Fermentis', productId: 'US-05', attenuationMinPct: 78, attenuationMaxPct: 82 });
    expect(data('styles/bjcp-2015/21a-american-ipa')).toMatchObject({ guide: 'BJCP 2015', og: [1.056, 1.07], carbVols: [2.2, 2.7] });
  });
});

describe('substitutes', () => {
  it('point at built-in items', () => {
    for (const item of SEED_ITEMS) for (const key of substitutesOf(item.seedKey)) expect(seedItem(key), `${item.seedKey} → ${key}`).toBeDefined();
  });

  it('offer other producers of the same malt', () => {
    const subs = substitutesOf('fermentables/weyermann/caramunich-type-3');
    expect(subs).toContain('fermentables/generic/caramunich-malt');
    expect(substitutesOf('fermentables/generic/caramunich-malt')).toContain('fermentables/weyermann/caramunich-type-3');
  });
});

describe('legacy keys', () => {
  it('map every old key to a built-in item of the same kind', () => {
    expect(Object.keys(LEGACY_SEED_KEYS).length).toBe(455);
    for (const [old, { key }] of Object.entries(LEGACY_SEED_KEYS)) {
      const item = seedItem(key);
      expect(item, old).toBeDefined();
      expect(old.startsWith(`${item!.kind}:`), old).toBe(true);
    }
    expect(currentSeedKey('culture:us-05-safale-american')).toBe('cultures/fermentis/safale-us-05');
    expect(currentSeedKey('hop:spalt')).toBe('hops/varieties/spalter');
    expect(currentSeedKey('misc:gypsum')).toBe('misc:gypsum');
  });
});

describe('Siduri’s own built-ins', () => {
  it('each water agent has its seed item', async () => {
    const { WATER_AGENTS, WATER_AGENT_INFO, waterAgentOf } = await import('@brew/shared');
    for (const agent of WATER_AGENTS) {
      const item = seedItem(WATER_AGENT_INFO[agent].seedKey);
      expect(item, agent).toBeDefined();
      // The seed name is recognised as that agent.
      expect(waterAgentOf(item!.data.name), item!.data.name).toBe(agent);
    }
  });

  it('has the target water profiles the water calculator suggests', () => {
    for (const key of ['yellow-balanced', 'yellow-bitter', 'pale-ale', 'amber-balanced', 'brown-malty', 'black-balanced']) {
      expect(seedItem(`water:${key}`), key).toBeDefined();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { LIBRARY_SCHEMAS } from '@brew/shared';
import { SEED_ITEMS } from '../src';

describe('seed data', () => {
  it('every item is valid and keys are unique', () => {
    const keys = new Set<string>();
    for (const item of SEED_ITEMS) {
      expect(() => LIBRARY_SCHEMAS[item.kind].parse(item.data), item.seedKey).not.toThrow();
      expect(keys.has(item.seedKey), item.seedKey).toBe(false);
      keys.add(item.seedKey);
    }
    expect(SEED_ITEMS.length).toBeGreaterThan(400);
  });
});

describe('water agents', () => {
  it('each agent has its seed item', async () => {
    const { WATER_AGENTS, WATER_AGENT_INFO, waterAgentOf } = await import('@brew/shared');
    for (const agent of WATER_AGENTS) {
      const item = SEED_ITEMS.find((i) => i.seedKey === WATER_AGENT_INFO[agent].seedKey);
      expect(item, agent).toBeDefined();
      // The seed name is recognised as that agent.
      expect(waterAgentOf(item!.data.name), item!.data.name).toBe(agent);
    }
  });
});

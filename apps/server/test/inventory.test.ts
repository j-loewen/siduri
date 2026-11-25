import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  newRecipeDoc,
  type BatchDto,
  type BatchInventoryDto,
  type InventoryItemDto,
  type InventoryTxDto,
  type LibraryItemDto,
  type LogEntryDto,
  type RecipeDto,
  type StockDto,
  type VesselDto,
} from '@brew/shared';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  ({ app } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

async function signedIn() {
  const c = client(app);
  await c.register('brewer');
  return c;
}

describe('inventory', () => {
  it('records purchases and adjustments, never below zero', async () => {
    const c = await signedIn();
    const item = (await c.post('/api/inventory', { kind: 'hop', name: 'Citra', amountKind: 'mass', amount: 0.1, minAmount: 0.05, lot: 'L1' })).json<InventoryItemDto>();
    expect(item).toMatchObject({ amount: 0.1, lot: 'L1' });
    const used = (await c.post(`/api/inventory/${item.id}/adjust`, { delta: -0.07, note: 'Hop tea' })).json<InventoryItemDto>();
    expect(used.amount).toBeCloseTo(0.03, 9);
    const empty = (await c.post(`/api/inventory/${item.id}/adjust`, { delta: -1 })).json<InventoryItemDto>();
    expect(empty.amount).toBe(0);
    const history = (await c.get(`/api/inventory/${item.id}/transactions`)).json<InventoryTxDto[]>();
    expect(history.map((t) => [t.reason, Number(t.delta.toFixed(3))])).toEqual([
      ['adjust', -0.03],
      ['adjust', -0.07],
      ['purchase', 0.1],
    ]);
    expect((await c.get('/api/inventory/low')).json<InventoryItemDto[]>().map((i) => i.name)).toEqual(['Citra']);
  });

  it('edits details without touching the amount, and validates', async () => {
    const c = await signedIn();
    const item = (await c.post('/api/inventory', { kind: 'fermentable', name: 'Pilsner', amount: 25 })).json<InventoryItemDto>();
    const edited = (await c.patch(`/api/inventory/${item.id}`, { location: 'Shelf 2' })).json<InventoryItemDto>();
    expect(edited).toMatchObject({ location: 'Shelf 2', amount: 25, name: 'Pilsner' });
    expect((await c.post('/api/inventory', { kind: 'gold', name: 'X' })).statusCode).toBe(400);
    expect((await c.post(`/api/inventory/${item.id}/adjust`, { delta: 0 })).statusCode).toBe(400);
  });

  it('sums stock over lots', async () => {
    const c = await signedIn();
    await c.post('/api/inventory', { kind: 'hop', libraryRef: 'lib-citra', name: 'Citra', amount: 0.1, lot: 'A' });
    await c.post('/api/inventory', { kind: 'hop', libraryRef: 'lib-citra', name: 'Citra', amount: 0.05, lot: 'B' });
    const stock = (await c.get('/api/inventory/stock')).json<StockDto[]>();
    expect(stock).toEqual([expect.objectContaining({ libraryRef: 'lib-citra', amount: expect.closeTo(0.15, 9) })]);
  });
});

describe('batches and the inventory', () => {
  async function setup() {
    const c = await signedIn();
    const [gypsum] = (await c.get('/api/library?kind=misc&q=gypsum')).json<LibraryItemDto[]>();
    const doc = newRecipeDoc('Pale');
    doc.fermentables.push({ id: 'f1', libraryRef: 'lib-pale', name: 'Pale Ale Malt', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 6, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' });
    doc.hops.push({ id: 'h1', libraryRef: null, name: 'Cascade', producer: '', origin: '', form: 'pellet', alphaPct: 6, betaPct: null, amountKg: 0.02, use: 'boil', timeMin: 60, tempC: null, day: null, durationDays: null });
    doc.hops.push({ id: 'h2', libraryRef: null, name: 'Cascade', producer: '', origin: '', form: 'pellet', alphaPct: 6, betaPct: null, amountKg: 0.04, use: 'boil', timeMin: 5, tempC: null, day: null, durationDays: null });
    doc.water.additions.push({ id: 'w1', agent: 'gypsum', amount: 0.005, where: 'mash' });
    const recipe = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    // Two lots of malt: the one that expires first is used first.
    const oldMalt = (await c.post('/api/inventory', { kind: 'fermentable', libraryRef: 'lib-pale', name: 'Pale ale malt (Crisp)', amount: 3, bestBefore: '2026-12-01' })).json<InventoryItemDto>();
    const newMalt = (await c.post('/api/inventory', { kind: 'fermentable', libraryRef: 'lib-pale', name: 'Pale ale malt (Crisp)', amount: 10, bestBefore: '2027-06-01' })).json<InventoryItemDto>();
    // Matched by name; only 50 g for 60 g needed.
    const hops = (await c.post('/api/inventory', { kind: 'hop', name: 'cascade', amount: 0.05 })).json<InventoryItemDto>();
    // Matched as the same water agent ("Gypsum" in German).
    const gips = (await c.post('/api/inventory', { kind: 'misc', name: 'Brauerei-Gips', amount: 0.2 })).json<InventoryItemDto>();
    return { c, batch, oldMalt, newMalt, hops, gips, gypsum: gypsum! };
  }

  it('plans what comes from where and what is missing', async () => {
    const { c, batch, oldMalt, newMalt } = await setup();
    const plan = (await c.get(`/api/batches/${batch.id}/inventory`)).json<BatchInventoryDto>();
    expect(plan.deductedAt).toBeNull();
    const malt = plan.lines.find((l) => l.key === 'gather:f1')!;
    expect(malt.takes.map((t) => [t.itemId, t.amount])).toEqual([
      [oldMalt.id, 3],
      [newMalt.id, 2],
    ]);
    // 20 g + 40 g of Cascade from 50 g: the second addition is 10 g short.
    expect(plan.lines.find((l) => l.key === 'gather:h1')).toMatchObject({ short: 0 });
    expect(plan.lines.find((l) => l.key === 'gather:h2')!.short).toBeCloseTo(0.01, 9);
    expect(plan.lines.find((l) => l.key === 'gather:w1')).toMatchObject({ short: 0, takes: [expect.objectContaining({ name: 'Brauerei-Gips' })] });
  });

  it('deducts and undoes', async () => {
    const { c, batch, oldMalt, newMalt, hops, gips } = await setup();
    const amount = async (id: string) => (await c.get(`/api/inventory/${id}`)).json<InventoryItemDto>().amount;

    const done = (await c.post(`/api/batches/${batch.id}/inventory/deduct`)).json<BatchInventoryDto>();
    expect(done.deductedAt).not.toBeNull();
    expect(await amount(oldMalt.id)).toBe(0);
    expect(await amount(newMalt.id)).toBe(8);
    expect(await amount(hops.id)).toBe(0);
    expect(await amount(gips.id)).toBeCloseTo(0.195, 9);
    expect((await c.post(`/api/batches/${batch.id}/inventory/deduct`)).statusCode).toBe(409);
    const history = (await c.get(`/api/inventory/${newMalt.id}/transactions`)).json<InventoryTxDto[]>();
    expect(history[0]).toMatchObject({ reason: 'brewday', batchNumber: 1, delta: -2 });

    const undone = (await c.post(`/api/batches/${batch.id}/inventory/undo`)).json<BatchInventoryDto>();
    expect(undone.deductedAt).toBeNull();
    expect(await amount(oldMalt.id)).toBe(3);
    expect(await amount(newMalt.id)).toBe(10);
    expect(await amount(hops.id)).toBeCloseTo(0.05, 9);
    expect((await c.post(`/api/batches/${batch.id}/inventory/undo`)).statusCode).toBe(409);
    const log = (await c.get(`/api/batches/${batch.id}/log`)).json<LogEntryDto[]>();
    expect(log.slice(0, 2).map((l) => l.text)).toEqual(['inventoryRestored', 'inventoryDeducted']);
  });
});

describe('vessels', () => {
  it('shows which batch is in which fermenter', async () => {
    const c = await signedIn();
    const fv = (await c.post('/api/vessels', { name: 'FV1', capacityL: 30 })).json<VesselDto>();
    expect(fv).toMatchObject({ kind: 'fermenter', currentBatch: null });
    const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Ale') })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: fv.id })).json<BatchDto>();
    expect(batch.vesselId).toBe(fv.id);
    // Planned batches don't occupy it yet.
    expect((await c.get(`/api/vessels/${fv.id}`)).json<VesselDto>().currentBatch).toBeNull();
    await c.patch(`/api/batches/${batch.id}`, { status: 'fermenting' });
    expect((await c.get('/api/vessels')).json<VesselDto[]>()[0]!.currentBatch).toMatchObject({ id: batch.id, number: 1 });
    expect((await c.post('/api/batches', { recipeId: recipe.id, vesselId: 'nope' })).statusCode).toBe(404);
    // Deleting the vessel keeps the batch.
    expect((await c.delete(`/api/vessels/${fv.id}`)).statusCode).toBe(204);
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().vesselId).toBeNull();
  });
});

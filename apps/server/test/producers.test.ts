import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  newRecipeDoc,
  type BatchDto,
  type BatchInventoryDto,
  type InventoryItemDto,
  type LibraryItemDto,
  type LibraryValuesDto,
  type RecipeDto,
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

describe('producers and origins', () => {
  it('stores countries by name and suggests the values in use', async () => {
    const c = await signedIn();
    const malt = (await c.post('/api/library', { kind: 'fermentable', data: { name: 'Pilsner Malt', producer: ' Weyermann ', origin: 'DE' } })).json<LibraryItemDto<'fermentable'>>();
    expect(malt.data).toMatchObject({ producer: 'Weyermann', origin: 'Germany' });
    await c.post('/api/library', { kind: 'hop', data: { name: 'Cascade', producer: 'Yakima Chief', origin: 'USA' } });
    await c.post('/api/inventory', { kind: 'fermentable', name: 'Maris Otter', producer: 'Crisp', amount: 5 });

    const values = (await c.get('/api/library/values?kind=fermentable')).json<LibraryValuesDto>();
    expect(values.producers).toEqual(expect.arrayContaining(['Weyermann', 'Crisp']));
    expect(values.producers).not.toContain('Yakima Chief');
    expect(values.origins).toEqual(expect.arrayContaining(['Germany', 'United States']));
    // Producers are searchable.
    expect((await c.get('/api/library?kind=fermentable&q=weyer')).json<LibraryItemDto[]>().map((i) => i.id)).toEqual([malt.id]);
  });

  it('keeps producers apart when matching stock by name', async () => {
    const c = await signedIn();
    const doc = newRecipeDoc('Helles');
    doc.fermentables.push({ id: 'f1', libraryRef: null, name: 'Pilsner Malt', type: 'grain', grainGroup: 'base', producer: 'Weyermann', origin: '', colorEbc: 3, potentialSg: 1.037, fermentability: 1, amountKg: 4, use: 'mash' });
    const recipe = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    const other = (await c.post('/api/inventory', { kind: 'fermentable', name: 'Pilsner Malt', producer: 'Best Malz', amount: 10 })).json<InventoryItemDto>();
    const unknown = (await c.post('/api/inventory', { kind: 'fermentable', name: 'pilsner malt', amount: 1 })).json<InventoryItemDto>();
    expect(other.producer).toBe('Best Malz');

    const line = (await c.get(`/api/batches/${batch.id}/inventory`)).json<BatchInventoryDto>().lines.find((l) => l.key === 'gather:f1')!;
    // Not the other maltster's malt; stock without a producer still counts.
    expect(line.takes.map((t) => t.itemId)).toEqual([unknown.id]);
    expect(line.short).toBe(3);
  });
});

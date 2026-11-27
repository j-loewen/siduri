import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  newRecipeDoc,
  type BatchDto,
  type DeviceDto,
  type InventoryItemDto,
  type InventoryTxDto,
  type LibraryItemDto,
  type LogEntryDto,
  type ReadingDto,
  type RecipeDto,
  type TrashListDto,
  type TrashRestoreDto,
  type VesselDto,
} from '@brew/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../src/db';
import { libraryItems, trash } from '../src/db/schema';
import { keepInTrash, purgeTrash } from '../src/services/trash';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
let db: Db;
beforeEach(async () => {
  ({ app, db } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

async function signedIn() {
  const c = client(app);
  await c.register('brewer');
  return c;
}
type Client = Awaited<ReturnType<typeof signedIn>>;

const listTrash = async (c: Client) => (await c.get('/api/trash')).json<TrashListDto>();
const restore = async (c: Client, kind: string) => {
  const entry = (await listTrash(c)).items.find((i) => i.kind === kind);
  expect(entry).toBeDefined();
  return c.post(`/api/trash/${entry!.id}/restore`);
};

describe('trash', () => {
  it('keeps a deleted recipe and restores it with its links', async () => {
    const c = await signedIn();
    const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Helles') })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    expect((await c.delete(`/api/recipes/${recipe.id}`)).statusCode).toBe(204);
    expect((await c.get(`/api/recipes/${recipe.id}`)).statusCode).toBe(404);
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().recipeId).toBeNull();

    const list = await listTrash(c);
    expect(list.days).toBe(30);
    expect(list.items).toEqual([expect.objectContaining({ kind: 'recipe', itemId: recipe.id, name: 'Helles' })]);
    const item = list.items[0]!;
    expect(Date.parse(item.purgeAt) - Date.parse(item.deletedAt)).toBe(30 * 24 * 3600_000);

    const res = await c.post(`/api/trash/${item.id}/restore`);
    expect(res.json<TrashRestoreDto>()).toEqual({ kind: 'recipe', id: recipe.id });
    const back = (await c.get(`/api/recipes/${recipe.id}`)).json<RecipeDto>();
    expect(back).toMatchObject({ id: recipe.id, version: recipe.version, createdAt: recipe.createdAt, doc: { name: 'Helles' } });
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().recipeId).toBe(recipe.id);
    expect((await listTrash(c)).items).toEqual([]);
    expect((await c.post(`/api/trash/${item.id}/restore`)).statusCode).toBe(404);
  });

  it('restores a batch with its readings, log, number, devices and stock history', async () => {
    const c = await signedIn();
    const fv = (await c.post('/api/vessels', { name: 'FV1' })).json<VesselDto>();
    const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Ale') })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: fv.id })).json<BatchDto>();
    await c.post(`/api/batches/${batch.id}/readings`, { gravity: 1.05, tempC: 19 });
    await c.post(`/api/batches/${batch.id}/log`, { text: 'Pitched' });
    const pill = (await c.post('/api/devices', { name: 'Pill', type: 'rapt_pill', batchId: batch.id })).json<DeviceDto>();
    const hops = (await c.post('/api/inventory', { kind: 'hop', name: 'Citra', amountKind: 'mass', amount: 1 })).json<InventoryItemDto>();

    await c.delete(`/api/batches/${batch.id}`);
    expect((await c.get(`/api/devices`)).json<DeviceDto[]>()[0]!.batchId).toBeNull();
    // Its number stays reserved while it is in the trash.
    const next = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    expect(next.number).toBe(batch.number + 1);

    expect((await restore(c, 'batch')).statusCode).toBe(200);
    const back = (await c.get(`/api/batches/${batch.id}`)).json<BatchDto>();
    expect(back).toMatchObject({ number: batch.number, recipeId: recipe.id, vesselId: fv.id, name: batch.name });
    expect((await c.get(`/api/batches/${batch.id}/readings`)).json<ReadingDto[]>().map((r) => r.gravity)).toEqual([1.05]);
    expect((await c.get(`/api/batches/${batch.id}/log`)).json<LogEntryDto[]>().map((l) => l.text)).toEqual(expect.arrayContaining(['Pitched', 'created']));
    expect((await c.get(`/api/devices/${pill.id}`)).json<DeviceDto>().batchId).toBe(batch.id);
    expect((await c.get(`/api/inventory/${hops.id}`)).statusCode).toBe(200);
  });

  it('restores stock items with their history, and vessels into their batches', async () => {
    const c = await signedIn();
    const item = (await c.post('/api/inventory', { kind: 'hop', name: 'Citra', amountKind: 'mass', amount: 0.1 })).json<InventoryItemDto>();
    await c.post(`/api/inventory/${item.id}/adjust`, { delta: -0.02 });
    await c.delete(`/api/inventory/${item.id}`);
    expect((await restore(c, 'inventory')).statusCode).toBe(200);
    expect((await c.get(`/api/inventory/${item.id}`)).json<InventoryItemDto>().amount).toBeCloseTo(0.08, 9);
    expect((await c.get(`/api/inventory/${item.id}/transactions`)).json<InventoryTxDto[]>()).toHaveLength(2);

    const fv = (await c.post('/api/vessels', { name: 'FV2' })).json<VesselDto>();
    const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Ale') })).json<RecipeDto>();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: fv.id })).json<BatchDto>();
    await c.delete(`/api/vessels/${fv.id}`);
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().vesselId).toBeNull();
    await restore(c, 'vessel');
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().vesselId).toBe(fv.id);
  });

  it('undoes a delete by kind and id', async () => {
    const c = await signedIn();
    const r = (await c.post('/api/recipes', { doc: newRecipeDoc('Oops') })).json<RecipeDto>();
    await c.delete(`/api/recipes/${r.id}`);
    expect((await c.post('/api/trash/undo', { kind: 'batch', itemId: r.id })).statusCode).toBe(404);
    expect((await c.post('/api/trash/undo', { kind: 'nope', itemId: r.id })).statusCode).toBe(400);
    const res = await c.post('/api/trash/undo', { kind: 'recipe', itemId: r.id });
    expect(res.json<TrashRestoreDto>()).toEqual({ kind: 'recipe', id: r.id });
    expect((await c.get(`/api/recipes/${r.id}`)).statusCode).toBe(200);
    expect((await listTrash(c)).items).toEqual([]);
    // Twice is not found: it is back already.
    expect((await c.post('/api/trash/undo', { kind: 'recipe', itemId: r.id })).statusCode).toBe(404);
  });

  it('links a batch and its vessel again whichever was deleted and restored first', async () => {
    const c = await signedIn();
    const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Ale') })).json<RecipeDto>();
    for (const [deleteFirst, restoreFirst] of [
      ['vessel', 'vessel'],
      ['vessel', 'batch'],
      ['batch', 'vessel'],
      ['batch', 'batch'],
    ] as const) {
      const fv = (await c.post('/api/vessels', { name: `FV ${deleteFirst}/${restoreFirst}` })).json<VesselDto>();
      const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: fv.id })).json<BatchDto>();
      const urls = { vessel: `/api/vessels/${fv.id}`, batch: `/api/batches/${batch.id}` };
      await c.delete(urls[deleteFirst]);
      await c.delete(urls[deleteFirst === 'vessel' ? 'batch' : 'vessel']);
      await restore(c, restoreFirst);
      await restore(c, restoreFirst === 'vessel' ? 'batch' : 'vessel');
      expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().vesselId, `${deleteFirst} deleted first, ${restoreFirst} restored first`).toBe(fv.id);
    }
  });

  it('restores library items, and equipment profiles as the default when there is none', async () => {
    const c = await signedIn();
    const own = (await c.post('/api/library', { kind: 'misc', data: { name: 'House salt mix', type: 'water_agent' } })).json<LibraryItemDto>();
    await c.delete(`/api/library/${own.id}`);
    await restore(c, 'library');
    expect((await c.get(`/api/library/${own.id}`)).json<LibraryItemDto>()).toMatchObject({ seedKey: null, name: 'House salt mix' });

    // Built-in items can't be deleted any more, but the trash may hold one deleted before (here
    // even before open-brewing-data): it comes back under its new key, with today's values.
    const [citra] = (await c.get('/api/library?kind=hop&q=Citra')).json<LibraryItemDto<'hop'>[]>();
    db.transaction((tx) => {
      keepInTrash(tx as unknown as Db, 'library', citra!.id);
      tx.delete(libraryItems).where(eq(libraryItems.id, citra!.id)).run();
    });
    const entry = db.select().from(trash).where(eq(trash.itemId, citra!.id)).get()!;
    const snapshot = entry.data as { row: Record<string, unknown> };
    db.update(trash)
      .set({ data: { ...snapshot, row: { ...snapshot.row, seedKey: 'hop:citra', data: { ...citra!.data, alphaPct: 1 } } } })
      .where(eq(trash.id, entry.id))
      .run();
    await restore(c, 'library');
    expect((await c.get(`/api/library/${citra!.id}`)).json<LibraryItemDto<'hop'>>()).toMatchObject({
      seedKey: 'hops/varieties/citra',
      readOnly: true,
      data: { alphaPct: citra!.data.alphaPct },
    });

    const eq1 = (await c.post('/api/equipment', { data: { name: 'Kettle' } })).json<{ id: string }>();
    await c.delete(`/api/equipment/${eq1.id}`);
    expect((await c.get('/api/settings')).json<{ defaultEquipmentId: string | null }>().defaultEquipmentId).toBeNull();
    await restore(c, 'equipment');
    expect((await c.get('/api/settings')).json<{ defaultEquipmentId: string | null }>().defaultEquipmentId).toBe(eq1.id);
  });

  it('deletes for good: one entry, everything, and after the set number of days', async () => {
    const c = await signedIn();
    for (const name of ['A', 'B', 'C']) {
      const r = (await c.post('/api/recipes', { doc: newRecipeDoc(name) })).json<RecipeDto>();
      await c.delete(`/api/recipes/${r.id}`);
    }
    const [newest] = (await listTrash(c)).items;
    expect(newest!.name).toBe('C');
    expect((await c.delete(`/api/trash/${newest!.id}`)).statusCode).toBe(204);
    expect((await listTrash(c)).items.map((i) => i.name)).toEqual(['B', 'A']);

    // Make "A" 10 days old; a 7-day trash drops it right away.
    const a = (await listTrash(c)).items[1]!;
    db.update(trash).set({ deletedAt: new Date(Date.now() - 10 * 24 * 3600_000) }).where(eq(trash.id, a.id)).run();
    expect(purgeTrash(db)).toBe(0);
    expect((await c.patch('/api/settings', { trashDays: 7 })).statusCode).toBe(200);
    expect((await listTrash(c)).items.map((i) => i.name)).toEqual(['B']);

    expect((await c.delete('/api/trash')).statusCode).toBe(204);
    expect((await listTrash(c)).items).toEqual([]);
  });

  it('deletes right away when the trash is off', async () => {
    const c = await signedIn();
    await c.patch('/api/settings', { trashDays: 0 });
    const r = (await c.post('/api/recipes', { doc: newRecipeDoc('Gone') })).json<RecipeDto>();
    expect((await c.delete(`/api/recipes/${r.id}`)).statusCode).toBe(204);
    expect(await listTrash(c)).toEqual({ days: 0, items: [] });
    expect((await c.patch('/api/settings', { trashDays: 400 })).statusCode).toBe(400);
  });

  it('refuses to restore over a record that is back with the same id', async () => {
    const c = await signedIn();
    const r = (await c.post('/api/recipes', { doc: newRecipeDoc('Twice') })).json<RecipeDto>();
    await c.delete(`/api/recipes/${r.id}`);
    const entry = (await listTrash(c)).items[0]!;
    const row = db.select().from(trash).where(eq(trash.id, entry.id)).get()!;
    // A second copy of the entry, as if it were deleted twice.
    db.insert(trash).values({ ...row, id: 'copy' }).run();
    expect((await c.post(`/api/trash/${entry.id}/restore`)).statusCode).toBe(200);
    expect((await c.post('/api/trash/copy/restore')).statusCode).toBe(409);
  });
});

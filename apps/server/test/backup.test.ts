import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  newRecipeDoc,
  type AppSettings,
  type BackupFile,
  type BackupImportResult,
  type BatchDto,
  type EquipmentDto,
  type ImageDto,
  type InventoryItemDto,
  type InventoryTxDto,
  type LibraryItemDto,
  type ReadingDto,
  type RecipeDto,
  type UserDto,
  type VesselDto,
} from '@brew/shared';
import { client, makeApp } from './helpers';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function server(username = 'brewer') {
  const { app } = await makeApp();
  apps.push(app);
  const c = client(app);
  await c.register(username);
  return c;
}
type Client = Awaited<ReturnType<typeof server>>;

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);
const sections = 'recipes,batches,inventory,equipment,water,library,settings';

async function exportFile(c: Client, include = sections) {
  const res = await c.get(`/api/backup/export?include=${include}`);
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-disposition']).toMatch(/attachment; filename="siduri-backup-\d{4}-\d{2}-\d{2}\.json"/);
  return { text: res.body, file: res.json<BackupFile>() };
}

async function importFile(c: Client, body: string, include = sections) {
  return c.upload(`/api/backup/import?include=${include}`, body);
}

/** A brewery with a bit of everything. */
async function fill(c: Client) {
  const seedHop = (await c.get('/api/library?kind=hop&q=Citra')).json<LibraryItemDto<'hop'>[]>()[0]!;
  const ownHop = (await c.post('/api/library', { kind: 'hop', data: { name: 'Garden Hop', alphaPct: 6 } })).json<LibraryItemDto>();
  const water = (await c.post('/api/library', { kind: 'water', data: { name: 'Tap water', calcium: 40 } })).json<LibraryItemDto>();
  const equipment = (await c.post('/api/equipment', { data: { name: 'Big Kettle', batchVolumeL: 40 } })).json<EquipmentDto>();
  const vessel = (await c.post('/api/vessels', { name: 'Fermenter A', capacityL: 30 })).json<VesselDto>();
  const image = (await c.upload('/api/images', png)).json<ImageDto>();
  const doc = newRecipeDoc('Garden IPA');
  doc.image = image.id;
  doc.hops = [
    { id: 'h1', libraryRef: seedHop.id, name: seedHop.name, producer: '', origin: '', form: 'pellet', alphaPct: 12, betaPct: null, amountKg: 0.05, use: 'boil', timeMin: 60 } as never,
    { id: 'h2', libraryRef: ownHop.id, name: 'Garden Hop', producer: '', origin: '', form: 'pellet', alphaPct: 6, betaPct: null, amountKg: 0.02, use: 'boil', timeMin: 10 } as never,
  ];
  const recipe = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
  const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: vessel.id })).json<BatchDto>();
  await c.post(`/api/batches/${batch.id}/readings`, { gravity: 1.05, tempC: 19 });
  const stock = (await c.post('/api/inventory', { kind: 'hop', libraryRef: seedHop.id, name: seedHop.name, amount: 0.1 })).json<InventoryItemDto>();
  await c.post(`/api/inventory/${stock.id}/adjust`, { delta: -0.02, note: 'Dry hop test' });
  await c.patch('/api/settings', { breweryName: 'Garage Brewing', breweryLogo: image.id, defaultEquipmentId: equipment.id, defaultSourceWaterId: water.id });
  await c.patch('/api/me/prefs', { theme: 'dark', units: { temperature: 'F' } });
  return { seedHop, ownHop, water, equipment, vessel, image, recipe, batch, stock };
}

describe('backup', () => {
  it('moves everything to another server, keeping references', async () => {
    const a = await server();
    const made = await fill(a);
    const { text, file } = await exportFile(a);

    // Only the user's own library items, no secrets.
    expect(file.water?.map((w) => w.data.name)).toEqual(['Tap water']);
    expect(file.library?.map((l) => l.data.name)).toEqual(['Garden Hop']);
    expect(file.seedRefs?.[made.seedHop.id]).toBe(made.seedHop.seedKey);
    expect(text).not.toMatch(/password|token/i);

    const b = await server('other');
    const res = await importFile(b, text);
    expect(res.statusCode).toBe(200);
    const result = res.json<BackupImportResult>();
    expect(result.added).toEqual({ recipes: 1, batches: 1, inventory: 1, equipment: 2, water: 1, library: 1, settings: 1 });

    // The built-in Citra has another id here; references follow it.
    const localCitra = (await b.get('/api/library?kind=hop&q=Citra')).json<LibraryItemDto[]>()[0]!;
    expect(localCitra.id).not.toBe(made.seedHop.id);
    const recipe = (await b.get(`/api/recipes/${made.recipe.id}`)).json<RecipeDto>();
    expect(recipe.doc.hops.map((h) => h.libraryRef)).toEqual([localCitra.id, made.ownHop.id]);
    expect(recipe.doc.image).toBe(made.image.id);
    expect(Buffer.from((await b.get(`/api/images/${made.image.id}`)).rawPayload).equals(png)).toBe(true);

    const batch = (await b.get(`/api/batches/${made.batch.id}`)).json<BatchDto>();
    expect(batch).toMatchObject({ number: 1, recipeId: made.recipe.id, vesselId: made.vessel.id });
    expect((await b.get(`/api/batches/${made.batch.id}/readings`)).json<ReadingDto[]>().map((r) => r.gravity)).toEqual([1.05]);

    const stock = (await b.get(`/api/inventory/${made.stock.id}`)).json<InventoryItemDto>();
    expect(stock.libraryRef).toBe(localCitra.id);
    expect(stock.amount).toBeCloseTo(0.08, 9);
    expect((await b.get(`/api/inventory/${made.stock.id}/transactions`)).json<InventoryTxDto[]>()).toHaveLength(2);

    expect((await b.get('/api/settings')).json<AppSettings>()).toEqual({
      breweryName: 'Garage Brewing',
      breweryLogo: made.image.id,
      defaultEquipmentId: made.equipment.id,
      defaultSourceWaterId: made.water.id,
    });
    const me = (await b.get('/api/me')).json<UserDto>();
    expect(me).toMatchObject({ username: 'other', prefs: { theme: 'dark', units: { temperature: 'F' } } });

    // A second import adds nothing.
    const again = (await importFile(b, text)).json<BackupImportResult>();
    expect(again.added).toMatchObject({ recipes: 0, batches: 0, inventory: 0, equipment: 0, water: 0, library: 0 });
    expect(again.skipped).toMatchObject({ recipes: 1, batches: 1, inventory: 1, equipment: 2, water: 1, library: 1 });
  });

  it('exports and imports only the chosen sections', async () => {
    const a = await server();
    const made = await fill(a);
    const { file } = await exportFile(a, 'recipes');
    expect(file.sections).toEqual(['recipes']);
    expect(file.recipes).toHaveLength(1);
    expect(file.batches ?? file.inventory ?? file.equipment ?? file.water ?? file.library ?? file.settings).toBeUndefined();

    const all = (await exportFile(a)).text;
    const b = await server();
    const result = (await importFile(b, all, 'equipment,water')).json<BackupImportResult>();
    expect(result.added).toMatchObject({ recipes: 0, batches: 0, equipment: 2, water: 1, settings: 0 });
    expect((await b.get(`/api/recipes/${made.recipe.id}`)).statusCode).toBe(404);
    expect((await b.get('/api/settings')).json<AppSettings>().breweryName).toBe('');

    // Batches without their recipe keep their copy of it, just not the link.
    await importFile(b, all, 'batches');
    expect((await b.get(`/api/batches/${made.batch.id}`)).json<BatchDto>()).toMatchObject({ recipeId: null, vesselId: made.vessel.id });
  });

  it('matches same-named items and renumbers taken batch numbers', async () => {
    const a = await server();
    const made = await fill(a);
    const { text } = await exportFile(a);

    const b = await server();
    const kettle = (await b.post('/api/equipment', { data: { name: 'big kettle' } })).json<EquipmentDto>();
    const local = (await b.post('/api/recipes', { doc: newRecipeDoc('Local') })).json<RecipeDto>();
    await b.post('/api/batches', { recipeId: local.id }); // takes number 1
    const result = (await importFile(b, text)).json<BackupImportResult>();
    expect(result.skipped.equipment).toBe(1);
    expect((await b.get(`/api/batches/${made.batch.id}`)).json<BatchDto>().number).toBe(2);
    expect((await b.get('/api/settings')).json<AppSettings>().defaultEquipmentId).toBe(kettle.id);
  });

  it('refuses other files', async () => {
    const c = await server();
    expect((await importFile(c, 'not json')).json()).toMatchObject({ error: 'backup_invalid' });
    expect((await importFile(c, JSON.stringify({ hello: 1 }))).json()).toMatchObject({ error: 'backup_invalid' });
    const { file } = await exportFile(c);
    expect((await importFile(c, JSON.stringify({ ...file, version: 99 }))).json()).toMatchObject({ error: 'backup_too_new' });
    const broken = { ...file, recipes: [{ id: 'x', doc: { name: '' }, createdAt: 'yesterday', updatedAt: 'now' }] };
    expect((await importFile(c, JSON.stringify(broken))).json()).toMatchObject({ error: 'backup_invalid' });
    const badPicture = { ...file, settings: { brewery: { breweryLogo: 'img' }, prefs: {} }, images: [{ id: 'img', data: Buffer.from('<svg/>').toString('base64') }] };
    expect((await importFile(c, JSON.stringify(badPicture))).json()).toMatchObject({ error: 'backup_invalid' });
    expect((await client(apps[0]!).get('/api/backup/export')).statusCode).toBe(401);
  });
});

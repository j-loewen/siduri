import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type ImportPreview, type LibraryItemDto, type RecipeDto, type RecipeSummaryDto, type UserDto } from '@brew/shared';
import { validateBeerJson } from '@brew/formats';
import { client, makeApp } from './helpers';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/formats/test/fixtures');

let app: FastifyInstance;
beforeEach(async () => {
  ({ app } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

async function signedIn() {
  const c = client(app);
  expect((await c.register('brewer')).statusCode).toBe(201);
  return c;
}

describe('accounts', () => {
  it('the first account is the admin; registration then closes', async () => {
    const c = client(app);
    expect((await c.get('/api/auth/status')).json()).toEqual({ needsSetup: true, registrationOpen: true });
    const res = await c.register('brewer');
    expect(res.json<UserDto>()).toMatchObject({ username: 'brewer', role: 'admin', prefs: { units: { massLarge: 'kg' } } });
    expect((await client(app).register('second')).statusCode).toBe(403);
    expect((await c.get('/api/auth/status')).json()).toEqual({ needsSetup: false, registrationOpen: false });
  });

  it('requires login and the CSRF header', async () => {
    expect((await client(app).get('/api/recipes')).statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' } });
    expect(res.statusCode).toBe(403);
  });

  it('saves unit preferences without dropping the others', async () => {
    const c = await signedIn();
    await c.patch('/api/me/prefs', { units: { massLarge: 'lb' } });
    const me = (await c.patch('/api/me/prefs', { units: { temperature: 'f' } })).json<UserDto>();
    expect(me.prefs.units).toMatchObject({ massLarge: 'lb', temperature: 'f', volume: 'l' });
  });
});

describe('library', () => {
  it('starts with the bundled ingredients', async () => {
    const c = await signedIn();
    const hops = (await c.get('/api/library?kind=hop&q=cascade')).json<LibraryItemDto[]>();
    expect(hops.length).toBeGreaterThan(0);
    expect(hops[0]).toMatchObject({ kind: 'hop', source: 'seed' });
    const styles = (await c.get('/api/library?kind=style')).json<LibraryItemDto[]>();
    expect(styles.length).toBeGreaterThan(100);
  });

  it('edits own items and deletes items', async () => {
    const c = await signedIn();
    const [malt] = (await c.get('/api/library?kind=fermentable&q=pilsner')).json<LibraryItemDto<'fermentable'>[]>();
    // Built-in items can't be edited.
    expect((await c.put(`/api/library/${malt!.id}`, { data: { ...malt!.data, colorEbc: 4.2 } })).statusCode).toBe(403);

    const created = (await c.post('/api/library', { kind: 'fermentable', data: { name: 'House Pilsner', colorEbc: 3.5, potentialSg: 1.0375 } })).json<LibraryItemDto<'fermentable'>>();
    expect(created.source).toBe('user');
    const edited = (await c.put(`/api/library/${created.id}`, { data: { ...created.data, colorEbc: 4.2 } })).json<LibraryItemDto<'fermentable'>>();
    expect(edited.data.colorEbc).toBe(4.2);
    expect((await c.delete(`/api/library/${created.id}`)).statusCode).toBe(204);
    expect((await c.get(`/api/library/${created.id}`)).statusCode).toBe(404);
  });

  it('rejects invalid data', async () => {
    const c = await signedIn();
    expect((await c.post('/api/library', { kind: 'hop', data: { name: '', alphaPct: 500 } })).statusCode).toBe(400);
  });
});

describe('recipes', () => {
  it('creates, lists, updates with version check and deletes', async () => {
    const c = await signedIn();
    const doc = newRecipeDoc('Helles');
    doc.fermentables.push({ id: 'f1', libraryRef: null, name: 'Pilsner', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 3.5, potentialSg: 1.037, fermentability: 1, amountKg: 4.5, use: 'mash' });
    const created = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
    expect(created.version).toBe(1);

    const list = (await c.get('/api/recipes')).json<RecipeSummaryDto[]>();
    expect(list).toHaveLength(1);
    expect(list[0]!.og).toBeGreaterThan(1.04);

    const updated = (await c.put(`/api/recipes/${created.id}`, { doc: { ...created.doc, name: 'Munich Helles' }, version: 1 })).json<RecipeDto>();
    expect(updated.version).toBe(2);
    // A save based on the old version is refused.
    expect((await c.put(`/api/recipes/${created.id}`, { doc: created.doc, version: 1 })).statusCode).toBe(409);

    expect((await c.get('/api/recipes?q=munich')).json<RecipeSummaryDto[]>()).toHaveLength(1);
    const copy = (await c.post(`/api/recipes/${created.id}/duplicate`, {})).json<RecipeDto>();
    expect(copy.doc.name).toBe('Munich Helles (copy)');

    expect((await c.delete(`/api/recipes/${created.id}`)).statusCode).toBe(204);
    expect((await c.get(`/api/recipes/${created.id}`)).statusCode).toBe(404);
  });

  it('exports BeerJSON and BeerXML', async () => {
    const c = await signedIn();
    const created = (await c.post('/api/recipes', { doc: newRecipeDoc('Stout') })).json<RecipeDto>();
    const json = await c.get(`/api/recipes/${created.id}/export?format=beerjson`);
    expect(json.headers['content-disposition']).toContain('Stout.json');
    expect(validateBeerJson(json.json())).toEqual([]);
    const xml = await c.get(`/api/recipes/${created.id}/export?format=beerxml`);
    expect(xml.body).toContain('<NAME>Stout</NAME>');
  });
});

describe('import', () => {
  it('previews a BeerXML file and saves the picked parts', async () => {
    const c = await signedIn();
    const preview = (await c.upload('/api/import/preview', fs.readFileSync(path.join(fixtures, 'Kolsh.xml')))).json<ImportPreview>();
    expect(preview.format).toBe('beerxml');
    expect(preview.recipes).toHaveLength(1);

    const result = (
      await c.post('/api/import/commit', {
        recipes: preview.recipes,
        library: [
          { kind: 'hop', data: { name: 'Brand New Hop', alphaPct: 9 } },
          { kind: 'hop', data: { name: 'cascade', alphaPct: 6 } },
        ],
        equipment: preview.equipment,
      })
    ).json();
    expect(result).toMatchObject({ libraryAdded: 1, librarySkipped: 1 });
    expect(result.recipeIds).toHaveLength(1);
    const recipe = (await c.get(`/api/recipes/${result.recipeIds[0]}`)).json<RecipeDto>();
    expect(recipe.doc.name).toBe("Lloyd's Krispy Kolsch");
  });

  it('explains unreadable files', async () => {
    const c = await signedIn();
    const res = await c.upload('/api/import/preview', 'not a recipe');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Unknown file type/);
  });
});

describe('equipment', () => {
  it('the first profile becomes the default', async () => {
    const c = await signedIn();
    const a = (await c.post('/api/equipment', { data: { name: 'Braumeister 20' } })).json();
    expect(a.isDefault).toBe(true);
    const b = (await c.post('/api/equipment', { data: { name: 'Kettle', method: 'biab' } })).json();
    expect(b.isDefault).toBe(false);
    await c.post(`/api/equipment/${b.id}/default`);
    expect((await c.get('/api/settings')).json().defaultEquipmentId).toBe(b.id);
    // Changing another setting keeps the default equipment.
    await c.patch('/api/settings', { breweryName: 'Garage Brewing' });
    expect((await c.get('/api/settings')).json()).toMatchObject({ breweryName: 'Garage Brewing', defaultEquipmentId: b.id });
    await c.delete(`/api/equipment/${b.id}`);
    expect((await c.get('/api/settings')).json().defaultEquipmentId).toBe(a.id);
  });
});

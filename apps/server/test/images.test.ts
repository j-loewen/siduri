import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type BatchDto, type BatchSummaryDto, type ImageDto, type RecipeDto, type RecipeSummaryDto } from '@brew/shared';
import type { Db } from '../src/db';
import { pruneImages } from '../src/services/images';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
let db: Db;
beforeEach(async () => {
  ({ app, db } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

/** Just the signature of a PNG file plus some bytes: enough for the type check. */
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(50, 1)]);

describe('pictures', () => {
  it('upload and download', async () => {
    const c = client(app);
    await c.register('brewer');
    const res = await c.upload('/api/images', webp);
    expect(res.statusCode).toBe(201);
    const image = res.json<ImageDto>();
    expect(image).toMatchObject({ type: 'image/webp', bytes: webp.length });
    const got = await c.get(`/api/images/${image.id}`);
    expect(got.headers['content-type']).toBe('image/webp');
    expect(got.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(got.rawPayload).equals(webp)).toBe(true);
  });

  it('only pictures, only signed in', async () => {
    const c = client(app);
    expect((await c.upload('/api/images', png)).statusCode).toBe(401);
    await c.register('brewer');
    const bad = await c.upload('/api/images', '<svg onload="alert(1)"></svg>');
    expect(bad.statusCode).toBe(400);
    expect((await c.upload('/api/images', Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]))).statusCode).toBe(413);
    expect((await c.get('/api/images/nope')).statusCode).toBe(404);
  });

  it('show in lists, go with batches, and unused ones are cleaned up', async () => {
    const c = client(app);
    await c.register('brewer');
    const used = (await c.upload('/api/images', png)).json<ImageDto>();
    const unused = (await c.upload('/api/images', png)).json<ImageDto>();
    const recipe = (await c.post('/api/recipes', { doc: { ...newRecipeDoc('Stout'), image: used.id } })).json<RecipeDto>();
    expect((await c.get('/api/recipes')).json<RecipeSummaryDto[]>()[0]!.image).toBe(used.id);
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    expect(batch.doc.image).toBe(used.id);
    expect((await c.get('/api/batches')).json<BatchSummaryDto[]>()[0]!.image).toBe(used.id);

    // Recently uploaded pictures are kept even when unused.
    expect(pruneImages(db, 60_000)).toBe(0);
    expect(pruneImages(db, -1)).toBe(1);
    expect((await c.get(`/api/images/${unused.id}`)).statusCode).toBe(404);
    expect((await c.get(`/api/images/${used.id}`)).statusCode).toBe(200);

    // The brewery logo is kept too.
    const logo = (await c.upload('/api/images', png)).json<ImageDto>();
    await c.patch('/api/settings', { breweryLogo: logo.id });
    expect(pruneImages(db, -1)).toBe(0);
    expect((await c.get('/api/settings')).json().breweryLogo).toBe(logo.id);

    // Still used by the batch after the recipe drops it.
    await c.put(`/api/recipes/${recipe.id}`, { doc: { ...recipe.doc, image: null }, version: recipe.version });
    expect(pruneImages(db, -1)).toBe(0);

    // Kept while the batch is in the trash; gone once the trash is emptied.
    await c.delete(`/api/batches/${batch.id}`);
    expect(pruneImages(db, -1)).toBe(0);
    await c.delete('/api/trash');
    expect(pruneImages(db, -1)).toBe(1);
    expect((await c.get(`/api/images/${used.id}`)).statusCode).toBe(404);
  });
});

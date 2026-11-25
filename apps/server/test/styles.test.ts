import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type ImportPreview, type RecipeDto } from '@brew/shared';
import type { Db } from '../src/db';
import { linkUnlinkedStyles } from '../src/services/style-match';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
let db: Db;
beforeEach(async () => {
  ({ app, db } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

/** A BeerJSON recipe as Brewfather exports it: the style by name, without ranges. */
const brewfatherFile = (style: object) =>
  JSON.stringify({
    beerjson: {
      version: 2.06,
      recipes: [
        {
          name: 'Stout',
          type: 'all grain',
          author: '',
          batch_size: { unit: 'l', value: 25 },
          efficiency: { brewhouse: { unit: '%', value: 72 } },
          style,
          ingredients: {
            fermentable_additions: [{ name: 'Pale', type: 'grain', amount: { unit: 'kg', value: 4 }, yield: { potential: { unit: 'sg', value: 1.037 } }, color: { unit: 'SRM', value: 3 } }],
          },
        },
      ],
    },
  });

async function importFile(c: ReturnType<typeof client>, body: string) {
  const preview = (await c.upload('/api/import/preview', body)).json<ImportPreview>();
  const result = (await c.post('/api/import/commit', { recipes: preview.recipes })).json<{ recipeIds: string[] }>();
  return (await c.get(`/api/recipes/${result.recipeIds[0]}`)).json<RecipeDto>();
}

describe('imported styles', () => {
  it('are linked to the library and get its ranges', async () => {
    const c = client(app);
    await c.register('brewer');
    const recipe = await importFile(c, brewfatherFile({ name: 'Irish Stout', category: 'Irish Beer', category_number: 15, style_letter: 'B', style_guide: 'BJCP 2015', type: 'beer' }));
    expect(recipe.doc.style).toMatchObject({ name: 'Irish Stout', guide: 'BJCP 2015', og: [1.036, 1.044] });
    expect(recipe.doc.style!.libraryRef).toBeTruthy();
  });

  it('match by category code when the name differs', async () => {
    const c = client(app);
    await c.register('brewer');
    const recipe = await importFile(c, brewfatherFile({ name: 'Dry Stout', category: 'Irish Beer', category_number: 15, style_letter: 'B', style_guide: 'BJCP 2015', type: 'beer' }));
    expect(recipe.doc.style).toMatchObject({ name: 'Irish Stout', og: [1.036, 1.044] });
  });

  it('stay as they are when nothing matches', async () => {
    const c = client(app);
    await c.register('brewer');
    const recipe = await importFile(c, brewfatherFile({ name: 'Moon Ale', category: 'Space', style_guide: 'Galactic 3000', type: 'beer' }));
    expect(recipe.doc.style).toMatchObject({ name: 'Moon Ale', libraryRef: null });
  });

  it('of recipes imported earlier are linked on startup', async () => {
    const c = client(app);
    await c.register('brewer');
    const doc = newRecipeDoc('Old import');
    doc.style = { libraryRef: null, name: 'Irish Stout', guide: 'BJCP 2015', category: '', categoryNumber: '', styleLetter: '', og: [null, null], fg: [null, null], ibu: [null, null], colorEbc: [null, null], abvPct: [null, null], carbVols: [null, null] };
    const created = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
    await c.post('/api/batches', { recipeId: created.id });
    expect(linkUnlinkedStyles(db)).toBe(2);
    const again = (await c.get(`/api/recipes/${created.id}`)).json<RecipeDto>();
    expect(again.doc.style).toMatchObject({ og: [1.036, 1.044] });
    expect(again.version).toBe(2);
    expect(linkUnlinkedStyles(db)).toBe(0);
  });
});

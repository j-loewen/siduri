import { z } from 'zod';
import { importFile, exportFile } from '@brew/formats';
import { createRecipeSchema, FILE_FORMATS, newRecipeDoc, recipeDocSchema, updateRecipeSchema } from '@brew/shared';
import { badRequest, parse } from '../../lib/errors';
import { createRecipe, deleteRecipe, duplicateRecipe, getRecipe, listRecipes, updateRecipe } from '../../services/recipes';
import { commitImport } from '../../services/transfer';
import { recipeSummary } from '../summary';
import { changed, tool } from '../tool';

const doc = z
  .record(z.string(), z.unknown())
  .describe('A recipe document as get_recipe returns it in "doc" (canonical units: kg, L, °C, SG, EBC, minutes). Missing fields get defaults.');

export const recipeTools = [
  tool({
    name: 'list_recipes',
    level: 'read',
    title: 'List recipes',
    description: 'All recipes (or those whose name matches the query) with style, batch size and calculated OG, FG, ABV, IBU and colour.',
    input: { query: z.string().max(100).optional() },
    run: ({ query }, { db }) => listRecipes(db, query?.trim() || undefined).map(({ image: _i, ...r }) => r),
  }),
  tool({
    name: 'get_recipe',
    level: 'read',
    title: 'Read a recipe',
    description:
      'A recipe: its document (ingredients, mash, fermentation, water, equipment, style), its version (needed to save changes) and the calculated values (gravities, IBU, colour, grist, volumes, water chemistry, equipment warnings).',
    input: { id: z.string() },
    run: ({ id }, { db }) => {
      const r = getRecipe(db, id);
      return { id: r.id, version: r.version, updatedAt: r.updatedAt, doc: r.doc, calculated: recipeSummary(r.doc) };
    },
  }),
  tool({
    name: 'calculate_recipe',
    level: 'read',
    title: 'Calculate a recipe',
    description: 'The calculated values of a recipe document without saving it: try changes (amounts, hops, batch size, water) before update_recipe.',
    input: { doc },
    run: ({ doc }) => recipeSummary(parse(recipeDocSchema, doc)),
  }),
  tool({
    name: 'export_recipe',
    level: 'read',
    title: 'Export a recipe',
    description: 'A recipe as a BeerXML or BeerJSON file (text), e.g. to use in other brewing software.',
    input: { id: z.string(), format: z.enum(FILE_FORMATS).default('beerjson') },
    run: ({ id, format }, { db }) => ({ format, file: exportFile([getRecipe(db, id).doc], format).body }),
  }),
  tool({
    name: 'create_recipe',
    level: 'write',
    title: 'Create a recipe',
    description: 'Create a recipe: an empty one with just a name, or from a full document (see get_recipe). Returns it with its calculated values.',
    input: { name: z.string().trim().min(1).max(120), doc: doc.optional() },
    run: ({ name, doc }, ctx) => {
      const full = doc ? parse(createRecipeSchema, { doc: { ...doc, name } }).doc : newRecipeDoc(name);
      const r = createRecipe(ctx.db, full);
      changed(ctx, 'recipes', r.id);
      return { id: r.id, version: r.version, doc: r.doc, calculated: recipeSummary(r.doc) };
    },
  }),
  tool({
    name: 'update_recipe',
    level: 'write',
    title: 'Save a recipe',
    description:
      'Save a changed recipe document. Send the whole document and the version you read; if the recipe changed meanwhile, the save is refused (read it again). Keep the ids of lines you keep.',
    input: { id: z.string(), version: z.number().int().min(1), doc },
    run: ({ id, version, doc }, ctx) => {
      const input = parse(updateRecipeSchema, { doc, version });
      const r = updateRecipe(ctx.db, id, input.doc, input.version);
      changed(ctx, 'recipes', r.id);
      return { id: r.id, version: r.version, calculated: recipeSummary(r.doc) };
    },
  }),
  tool({
    name: 'duplicate_recipe',
    level: 'write',
    title: 'Copy a recipe',
    description: 'Copy a recipe, e.g. to try a variation without changing the original.',
    input: { id: z.string(), name: z.string().trim().min(1).max(120).optional() },
    run: ({ id, name }, ctx) => {
      const r = duplicateRecipe(ctx.db, id, name);
      changed(ctx, 'recipes', r.id);
      return { id: r.id, version: r.version, name: r.doc.name };
    },
  }),
  tool({
    name: 'import_recipe',
    level: 'write',
    title: 'Import BeerXML / BeerJSON',
    description: 'Import the recipes of a BeerXML or BeerJSON file (its text). Optionally also adds the ingredients it defines to the library (existing names are skipped).',
    input: { content: z.string().min(1).max(5_000_000), addToLibrary: z.boolean().default(false) },
    run: ({ content, addToLibrary }, ctx) => {
      let preview;
      try {
        preview = importFile(new TextEncoder().encode(content));
      } catch (err) {
        throw badRequest((err as Error).message);
      }
      const result = commitImport(ctx.db, { recipes: preview.recipes, library: addToLibrary ? preview.library : [], equipment: [] });
      if (result.recipeIds.length) changed(ctx, 'recipes');
      if (result.libraryAdded) changed(ctx, 'library');
      return { ...result, warnings: preview.warnings };
    },
  }),
  tool({
    name: 'delete_recipe',
    level: 'full',
    title: 'Delete a recipe',
    description: 'Delete a recipe. Batches brewed from it keep their own copy. It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteRecipe(ctx.db, id);
      changed(ctx, 'recipes');
      return { deleted: id };
    },
  }),
];

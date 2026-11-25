import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRecipeSchema, FILE_FORMATS, recipeListQuerySchema, updateRecipeSchema } from '@brew/shared';
import { exportFile } from '@brew/formats';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { createRecipe, deleteRecipe, duplicateRecipe, getRecipe, listRecipes, updateRecipe } from '../services/recipes';

type IdParams = { Params: { id: string } };
const exportQuery = z.object({ format: z.enum(FILE_FORMATS).default('beerjson') });
const duplicateSchema = z.object({ name: z.string().trim().min(1).max(120).optional() });

/** Content-Disposition for a download, with a plain fallback name and the full name in UTF-8. */
function attachment(name: string, ext: string) {
  const ascii = name.replace(/[^\w .-]+/g, '').trim().slice(0, 80) || 'recipe';
  const utf8 = `${encodeURIComponent(name.slice(0, 80))}.${ext}`;
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8${"''"}${utf8}`;
}

export async function recipeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/recipes', async (req) => {
    requireUser(req);
    return listRecipes(db, parse(recipeListQuerySchema, req.query).q);
  });

  app.get<IdParams>('/api/recipes/:id', async (req) => {
    requireUser(req);
    return getRecipe(db, req.params.id);
  });

  app.post('/api/recipes', async (req, reply) => {
    requireUser(req);
    const recipe = createRecipe(db, parse(createRecipeSchema, req.body).doc);
    publishChange(req, 'recipes');
    return reply.code(201).send(recipe);
  });

  app.put<IdParams>('/api/recipes/:id', async (req) => {
    requireUser(req);
    const { doc, version } = parse(updateRecipeSchema, req.body);
    const recipe = updateRecipe(db, req.params.id, doc, version);
    publishChange(req, 'recipes', recipe.id);
    return recipe;
  });

  app.post<IdParams>('/api/recipes/:id/duplicate', async (req, reply) => {
    requireUser(req);
    const recipe = duplicateRecipe(db, req.params.id, parse(duplicateSchema, req.body ?? {}).name);
    publishChange(req, 'recipes');
    return reply.code(201).send(recipe);
  });

  app.delete<IdParams>('/api/recipes/:id', async (req, reply) => {
    requireUser(req);
    deleteRecipe(db, req.params.id);
    publishChange(req, 'recipes');
    return reply.code(204).send();
  });

  app.get<IdParams>('/api/recipes/:id/export', async (req, reply) => {
    requireUser(req);
    const { format } = parse(exportQuery, req.query);
    const { doc } = getRecipe(db, req.params.id);
    const file = exportFile([doc], format);
    return reply.header('content-type', file.contentType).header('content-disposition', attachment(doc.name, file.ext)).send(file.body);
  });
}

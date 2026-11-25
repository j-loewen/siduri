import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BATCH_STATUSES, brewDayActionSchema, createLogSchema, patchBatchSchema, saveToRecipeSchema, updateBatchDocSchema } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import {
  addNote,
  addReading,
  applyBrewDayAction,
  createBatch,
  deleteBatch,
  deleteNote,
  deleteReading,
  getBatch,
  listBatches,
  listLog,
  listReadings,
  patchBatch,
  saveBatchToRecipe,
  updateBatchDoc,
} from '../services/batches';

type IdParams = { Params: { id: string } };
type SubParams = { Params: { id: string; sub: string } };
const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(BATCH_STATUSES)).optional()),
});

export async function batchRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/batches', async (req) => {
    requireUser(req);
    return listBatches(db, parse(listQuery, req.query).status);
  });

  app.post('/api/batches', async (req, reply) => {
    requireUser(req);
    const batch = createBatch(db, req.body as never);
    publishChange(req, 'batches');
    return reply.code(201).send(batch);
  });

  app.get<IdParams>('/api/batches/:id', async (req) => {
    requireUser(req);
    return getBatch(db, req.params.id);
  });

  app.put<IdParams>('/api/batches/:id', async (req) => {
    requireUser(req);
    const { doc, version } = parse(updateBatchDocSchema, req.body);
    const batch = updateBatchDoc(db, req.params.id, doc, version);
    publishChange(req, 'batches', batch.id);
    return batch;
  });

  app.patch<IdParams>('/api/batches/:id', async (req) => {
    requireUser(req);
    const batch = patchBatch(db, req.params.id, parse(patchBatchSchema, req.body));
    publishChange(req, 'batches', batch.id);
    return batch;
  });

  app.delete<IdParams>('/api/batches/:id', async (req, reply) => {
    requireUser(req);
    deleteBatch(db, req.params.id);
    publishChange(req, 'batches');
    return reply.code(204).send();
  });

  /** Brew-day progress: steps, checklist and timers, applied with the server's clock. */
  app.post<IdParams>('/api/batches/:id/brewday', async (req) => {
    requireUser(req);
    const batch = applyBrewDayAction(db, req.params.id, parse(brewDayActionSchema, req.body));
    publishChange(req, 'batches', batch.id);
    return batch;
  });

  app.post<IdParams>('/api/batches/:id/save-to-recipe', async (req) => {
    requireUser(req);
    const { mode, name } = parse(saveToRecipeSchema, req.body);
    const recipe = saveBatchToRecipe(db, req.params.id, mode, name);
    publishChange(req, 'recipes', recipe.id);
    publishChange(req, 'batches', req.params.id);
    return recipe;
  });

  app.get<IdParams>('/api/batches/:id/readings', async (req) => {
    requireUser(req);
    return listReadings(db, req.params.id);
  });

  app.post<IdParams>('/api/batches/:id/readings', async (req, reply) => {
    requireUser(req);
    const reading = addReading(db, req.params.id, req.body);
    publishChange(req, 'batches', req.params.id);
    return reply.code(201).send(reading);
  });

  app.delete<SubParams>('/api/batches/:id/readings/:sub', async (req, reply) => {
    requireUser(req);
    deleteReading(db, req.params.id, req.params.sub);
    publishChange(req, 'batches', req.params.id);
    return reply.code(204).send();
  });

  app.get<IdParams>('/api/batches/:id/log', async (req) => {
    requireUser(req);
    return listLog(db, req.params.id);
  });

  app.post<IdParams>('/api/batches/:id/log', async (req, reply) => {
    requireUser(req);
    const { text, at } = parse(createLogSchema, req.body);
    const entry = addNote(db, req.params.id, text, at);
    publishChange(req, 'batches', req.params.id);
    return reply.code(201).send(entry);
  });

  app.delete<SubParams>('/api/batches/:id/log/:sub', async (req, reply) => {
    requireUser(req);
    deleteNote(db, req.params.id, req.params.sub);
    publishChange(req, 'batches', req.params.id);
    return reply.code(204).send();
  });
}

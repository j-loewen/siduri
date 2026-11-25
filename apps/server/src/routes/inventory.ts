import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { INVENTORY_KINDS } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import {
  adjustItem,
  batchInventory,
  createItem,
  deductBatch,
  deleteItem,
  getItem,
  listInventory,
  listTransactions,
  lowStock,
  stockSummary,
  undoBatchDeduction,
  updateItem,
} from '../services/inventory';

type IdParams = { Params: { id: string } };
const listQuery = z.object({ kind: z.enum(INVENTORY_KINDS).optional(), q: z.string().trim().max(100).optional() });

export async function inventoryRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/inventory', async (req) => {
    requireUser(req);
    const { kind, q } = parse(listQuery, req.query);
    return listInventory(db, kind, q || undefined);
  });

  /** Stock per ingredient (summed over lots), for the ingredient picker. */
  app.get('/api/inventory/stock', async (req) => {
    requireUser(req);
    return stockSummary(db);
  });

  app.get('/api/inventory/low', async (req) => {
    requireUser(req);
    return lowStock(db);
  });

  app.post('/api/inventory', async (req, reply) => {
    requireUser(req);
    const item = createItem(db, req.body);
    publishChange(req, 'inventory');
    return reply.code(201).send(item);
  });

  app.get<IdParams>('/api/inventory/:id', async (req) => {
    requireUser(req);
    return getItem(db, req.params.id);
  });

  app.patch<IdParams>('/api/inventory/:id', async (req) => {
    requireUser(req);
    const item = updateItem(db, req.params.id, req.body);
    publishChange(req, 'inventory');
    return item;
  });

  app.post<IdParams>('/api/inventory/:id/adjust', async (req) => {
    requireUser(req);
    const item = adjustItem(db, req.params.id, req.body);
    publishChange(req, 'inventory');
    return item;
  });

  app.get<IdParams>('/api/inventory/:id/transactions', async (req) => {
    requireUser(req);
    return listTransactions(db, req.params.id);
  });

  app.delete<IdParams>('/api/inventory/:id', async (req, reply) => {
    requireUser(req);
    deleteItem(db, req.params.id);
    publishChange(req, 'inventory');
    return reply.code(204).send();
  });

  // ---- A batch's ingredients ----

  app.get<IdParams>('/api/batches/:id/inventory', async (req) => {
    requireUser(req);
    return batchInventory(db, req.params.id);
  });

  app.post<IdParams>('/api/batches/:id/inventory/deduct', async (req) => {
    requireUser(req);
    const result = deductBatch(db, req.params.id);
    publishChange(req, 'inventory');
    publishChange(req, 'batches', req.params.id);
    return result;
  });

  app.post<IdParams>('/api/batches/:id/inventory/undo', async (req) => {
    requireUser(req);
    const result = undoBatchDeduction(db, req.params.id);
    publishChange(req, 'inventory');
    publishChange(req, 'batches', req.params.id);
    return result;
  });
}

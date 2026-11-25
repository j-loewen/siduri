import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIBRARY_KINDS, libraryListQuerySchema, libraryValuesQuerySchema } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { createLibraryItem, deleteLibraryItem, getLibraryItem, libraryValues, listLibrary, resetLibraryItem, updateLibraryItem } from '../services/library';

type IdParams = { Params: { id: string } };
const createSchema = z.object({ kind: z.enum(LIBRARY_KINDS), data: z.unknown() });
const updateSchema = z.object({ data: z.unknown() });

export async function libraryRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/library', async (req) => {
    requireUser(req);
    return listLibrary(db, parse(libraryListQuerySchema, req.query));
  });

  app.get('/api/library/values', async (req) => {
    requireUser(req);
    return libraryValues(db, parse(libraryValuesQuerySchema, req.query).kind);
  });

  app.get<IdParams>('/api/library/:id', async (req) => {
    requireUser(req);
    return getLibraryItem(db, req.params.id);
  });

  app.post('/api/library', async (req, reply) => {
    requireUser(req);
    const { kind, data } = parse(createSchema, req.body);
    const item = createLibraryItem(db, kind, data);
    publishChange(req, 'library');
    return reply.code(201).send(item);
  });

  app.put<IdParams>('/api/library/:id', async (req) => {
    requireUser(req);
    const item = updateLibraryItem(db, req.params.id, parse(updateSchema, req.body).data);
    publishChange(req, 'library', item.id);
    return item;
  });

  app.post<IdParams>('/api/library/:id/reset', async (req) => {
    requireUser(req);
    const item = resetLibraryItem(db, req.params.id);
    publishChange(req, 'library', item.id);
    return item;
  });

  app.delete<IdParams>('/api/library/:id', async (req, reply) => {
    requireUser(req);
    deleteLibraryItem(db, req.params.id);
    publishChange(req, 'library');
    return reply.code(204).send();
  });
}

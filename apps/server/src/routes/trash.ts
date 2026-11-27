import type { FastifyInstance, FastifyRequest } from 'fastify';
import { trashUndoSchema, type TrashRestoreDto } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { deleteFromTrash, emptyTrash, listTrash, restoreFromTrash, restoreItem, trashAreas } from '../services/trash';

type IdParams = { Params: { id: string } };

/** The trash: deleted things, until they are restored or `trashDays` have passed (a brewery setting). */
export async function trashRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/trash', async (req) => {
    requireUser(req);
    return listTrash(db);
  });

  const restored = (req: FastifyRequest, result: TrashRestoreDto) => {
    for (const area of trashAreas(result.kind)) publishChange(req, area);
    publishChange(req, 'trash');
    return result;
  };

  app.post<IdParams>('/api/trash/:id/restore', async (req) => {
    requireUser(req);
    return restored(req, restoreFromTrash(db, req.params.id));
  });

  /** The Undo of a delete notification: by what was deleted, not by the trash entry. */
  app.post('/api/trash/undo', async (req) => {
    requireUser(req);
    const { kind, itemId } = parse(trashUndoSchema, req.body);
    return restored(req, restoreItem(db, kind, itemId));
  });

  app.delete<IdParams>('/api/trash/:id', async (req, reply) => {
    requireUser(req);
    deleteFromTrash(db, req.params.id);
    publishChange(req, 'trash');
    return reply.code(204).send();
  });

  app.delete('/api/trash', async (req, reply) => {
    requireUser(req);
    emptyTrash(db);
    publishChange(req, 'trash');
    return reply.code(204).send();
  });
}

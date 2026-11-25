import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { createVessel, deleteVessel, getVessel, listVessels, updateVessel } from '../services/vessels';

type IdParams = { Params: { id: string } };

export async function vesselRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/vessels', async (req) => {
    requireUser(req);
    return listVessels(db);
  });

  app.get<IdParams>('/api/vessels/:id', async (req) => {
    requireUser(req);
    return getVessel(db, req.params.id);
  });

  app.post('/api/vessels', async (req, reply) => {
    requireUser(req);
    const vessel = createVessel(db, req.body);
    publishChange(req, 'equipment');
    return reply.code(201).send(vessel);
  });

  app.patch<IdParams>('/api/vessels/:id', async (req) => {
    requireUser(req);
    const vessel = updateVessel(db, req.params.id, req.body);
    publishChange(req, 'equipment');
    return vessel;
  });

  app.delete<IdParams>('/api/vessels/:id', async (req, reply) => {
    requireUser(req);
    deleteVessel(db, req.params.id);
    publishChange(req, 'equipment');
    publishChange(req, 'batches');
    return reply.code(204).send();
  });
}

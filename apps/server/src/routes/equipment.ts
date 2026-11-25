import type { FastifyInstance } from 'fastify';
import { equipmentInputSchema } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { createEquipment, deleteEquipment, getEquipment, listEquipment, updateEquipment } from '../services/equipment';
import { updateSettings } from '../services/settings';

type IdParams = { Params: { id: string } };

export async function equipmentRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/equipment', async (req) => {
    requireUser(req);
    return listEquipment(db);
  });

  app.get<IdParams>('/api/equipment/:id', async (req) => {
    requireUser(req);
    return getEquipment(db, req.params.id);
  });

  app.post('/api/equipment', async (req, reply) => {
    requireUser(req);
    const item = createEquipment(db, parse(equipmentInputSchema, req.body).data);
    publishChange(req, 'equipment');
    return reply.code(201).send(item);
  });

  app.put<IdParams>('/api/equipment/:id', async (req) => {
    requireUser(req);
    const item = updateEquipment(db, req.params.id, parse(equipmentInputSchema, req.body).data);
    publishChange(req, 'equipment', item.id);
    return item;
  });

  /** Make this the profile new recipes start with. */
  app.post<IdParams>('/api/equipment/:id/default', async (req) => {
    requireUser(req);
    getEquipment(db, req.params.id);
    updateSettings(db, { defaultEquipmentId: req.params.id });
    publishChange(req, 'equipment');
    publishChange(req, 'settings');
    return getEquipment(db, req.params.id);
  });

  app.delete<IdParams>('/api/equipment/:id', async (req, reply) => {
    requireUser(req);
    deleteEquipment(db, req.params.id);
    publishChange(req, 'equipment');
    return reply.code(204).send();
  });
}

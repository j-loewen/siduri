import type { FastifyInstance } from 'fastify';
import { updateAppSettingsSchema } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { getSettings, updateSettings } from '../services/settings';

export async function settingsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/settings', async (req) => {
    requireUser(req);
    return getSettings(db);
  });

  app.patch('/api/settings', async (req) => {
    requireUser(req);
    const settings = updateSettings(db, parse(updateAppSettingsSchema, req.body));
    publishChange(req, 'settings');
    return settings;
  });
}

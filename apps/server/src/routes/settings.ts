import type { FastifyInstance } from 'fastify';
import { updateAppSettingsSchema } from '@brew/shared';
import type { Db } from '../db';
import { parse } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { getSettings, updateSettings } from '../services/settings';
import { purgeTrash } from '../services/trash';

export async function settingsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/settings', async (req) => {
    requireUser(req);
    return getSettings(db);
  });

  app.patch('/api/settings', async (req) => {
    requireUser(req);
    const patch = parse(updateAppSettingsSchema, req.body);
    const settings = updateSettings(db, patch);
    publishChange(req, 'settings');
    if (patch.trashDays !== undefined) {
      // A shorter time applies right away.
      purgeTrash(db);
      publishChange(req, 'trash');
    }
    return settings;
  });
}

import type { FastifyInstance } from 'fastify';
import { APP_ID, backupIncludeSchema, type BackupSection, type LiveArea } from '@brew/shared';
import type { Db } from '../db';
import { badRequest, HttpError, parse } from '../lib/errors';
import { publishChange, publishMe } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { exportBackup, importBackup } from '../services/backup';

/** Backups hold pictures (base64), so they can be much larger than other requests. */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

const LIVE_AREAS: Record<BackupSection, LiveArea> = {
  recipes: 'recipes',
  batches: 'batches',
  inventory: 'inventory',
  equipment: 'equipment',
  water: 'library',
  library: 'library',
  settings: 'settings',
};

/** Backup files of the brewery's own data (Settings → Backup). */
export async function backupRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Raw uploads only in this plugin's scope.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_BACKUP_BYTES }, (_req, body, done) => done(null, body));

  app.get('/api/backup/export', async (req, reply) => {
    const { user } = requireUser(req);
    const { include } = parse(backupIncludeSchema, req.query);
    const file = exportBackup(db, user, include);
    const name = `${APP_ID}-backup-${file.exportedAt.slice(0, 10)}.json`;
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="${name}"`)
      .header('cache-control', 'no-store')
      .send(JSON.stringify(file));
  });

  app.post('/api/backup/import', { bodyLimit: MAX_BACKUP_BYTES }, async (req) => {
    const { user } = requireUser(req);
    const { include } = parse(backupIncludeSchema, req.query);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('Send the backup file as the request body');
    let raw: unknown;
    try {
      raw = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new HttpError(400, 'backup_invalid', 'Not a Siduri backup file');
    }
    const result = importBackup(db, user, raw, include);
    const areas = new Set(include.filter((s) => result.added[s] > 0).map((s) => LIVE_AREAS[s]));
    for (const area of areas) publishChange(req, area);
    if (result.added.settings) publishMe(req, user.id);
    return result;
  });
}

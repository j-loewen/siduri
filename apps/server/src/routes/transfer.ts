import type { FastifyInstance } from 'fastify';
import { importFile } from '@brew/formats';
import type { Db } from '../db';
import { badRequest } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { commitImport } from '../services/transfer';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** BeerXML / BeerJSON import: read a file into a preview, then save the parts the user picked. */
export async function transferRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Raw uploads only in this plugin's scope.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_IMPORT_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/api/import/preview', { bodyLimit: MAX_IMPORT_BYTES }, async (req) => {
    requireUser(req);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('Send the file as the request body');
    try {
      return importFile(new Uint8Array(req.body));
    } catch (err) {
      throw badRequest((err as Error).message);
    }
  });

  app.post('/api/import/commit', { bodyLimit: MAX_IMPORT_BYTES }, async (req) => {
    requireUser(req);
    const result = commitImport(db, req.body as never);
    if (result.recipeIds.length) publishChange(req, 'recipes');
    if (result.libraryAdded) publishChange(req, 'library');
    if (result.equipmentAdded) publishChange(req, 'equipment');
    return result;
  });
}

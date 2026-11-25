import type { FastifyInstance } from 'fastify';
import { MAX_IMAGE_BYTES } from '@brew/shared';
import type { Db } from '../db';
import { badRequest } from '../lib/errors';
import { requireUser } from '../plugins/auth';
import { getImage, saveImage } from '../services/images';

type IdParams = { Params: { id: string } };

/** Pictures: upload (raw body) and download. Ids are random and pictures never change. */
export async function imageRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.addContentTypeParser(['application/octet-stream', 'image/webp', 'image/jpeg', 'image/png', 'image/gif'], { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES + 1024 }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/api/images', { bodyLimit: MAX_IMAGE_BYTES + 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    requireUser(req);
    if (!Buffer.isBuffer(req.body)) throw badRequest('Send the picture as the request body');
    return reply.code(201).send(saveImage(db, req.body));
  });

  app.get<IdParams>('/api/images/:id', async (req, reply) => {
    requireUser(req);
    const image = getImage(db, req.params.id);
    return reply
      .header('content-type', image.type)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(image.data);
  });
}

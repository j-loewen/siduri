import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import type { AppConfig } from './config';
import type { Db } from './db';
import { purgeExpiredSessions } from './auth/sessions';
import { HttpError } from './lib/errors';
import { LiveHub } from './live/hub';
import authPlugin from './plugins/auth';
import { authRoutes } from './routes/auth';
import { batchRoutes } from './routes/batches';
import { inventoryRoutes } from './routes/inventory';
import { vesselRoutes } from './routes/vessels';
import { deviceRoutes, ingestRoutes } from './routes/devices';
import { equipmentRoutes } from './routes/equipment';
import { libraryRoutes } from './routes/library';
import { liveRoutes } from './routes/live';
import { meRoutes } from './routes/me';
import { recipeRoutes } from './routes/recipes';
import { settingsRoutes } from './routes/settings';
import { transferRoutes } from './routes/transfer';
import { backupRoutes } from './routes/backup';
import { seedLibrary } from './services/library';
import { refreshRecipeStats } from './services/recipes';
import { pruneImages } from './services/images';
import { imageRoutes } from './routes/images';
import { mcpRoutes } from './routes/mcp';
import { tokenRoutes } from './routes/tokens';
import { linkUnlinkedStyles } from './services/style-match';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Mantine injects style tags
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

declare module 'fastify' {
  interface FastifyInstance {
    live: LiveHub;
  }
}

export async function buildApp(config: AppConfig, db: Db) {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 5 * 1024 * 1024,
  });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
    }
    return reply.code(status).send({ error: err.code ?? 'error', message: err.message });
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) {
      reply.header('Content-Security-Policy', CSP);
    }
    return payload;
  });

  // Live refresh: open event streams are ended before the server closes, or shutdown would wait for them.
  const live = new LiveHub();
  app.decorate('live', live);
  app.addHook('preClose', async () => live.closeAll());

  const seeded = seedLibrary(db);
  if (seeded) app.log.info(`Added ${seeded} items to the ingredient library`);
  const linked = linkUnlinkedStyles(db);
  if (linked) app.log.info(`Linked the style of ${linked} recipe(s) and batch(es) to the library`);
  const refreshed = refreshRecipeStats(db);
  if (refreshed) app.log.info(`Recalculated ${refreshed} recipe(s)`);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { db, config });

  app.get('/api/health', async () => {
    db.run(sql`select 1`);
    return { ok: true };
  });
  await app.register(authRoutes, { db, config });
  await app.register(meRoutes, { db });
  await app.register(settingsRoutes, { db });
  await app.register(libraryRoutes, { db });
  await app.register(equipmentRoutes, { db });
  await app.register(recipeRoutes, { db });
  await app.register(batchRoutes, { db });
  await app.register(inventoryRoutes, { db });
  await app.register(vesselRoutes, { db });
  // Smart devices push their readings to /api/integrations/… (RAPT through its data stream).
  await app.register(deviceRoutes, { db, config });
  await app.register(ingestRoutes, { db });
  await app.register(transferRoutes, { db });
  await app.register(backupRoutes, { db });
  await app.register(imageRoutes, { db });
  await app.register(liveRoutes, { db, config });
  // Claude and other AI assistants (MCP), with access tokens managed in the settings.
  await app.register(tokenRoutes, { db });
  await app.register(mcpRoutes, { db, config });

  const webDist = config.webDist;
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      setHeaders: (res, filePath) => {
        // Vite emits content-hashed file names under /assets, so they can be cached forever.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // SPA fallback: unknown non-API GETs get index.html so client-side routes work on reload.
    if (webDist && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found', message: 'Not found' });
  });

  const housekeeping = () => {
    purgeExpiredSessions(db);
    // Pictures no recipe or batch uses (replaced or removed) go after a day.
    pruneImages(db, 24 * 3600_000);
  };
  housekeeping();
  const cleanup = setInterval(housekeeping, 60 * 60 * 1000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));

  return app;
}

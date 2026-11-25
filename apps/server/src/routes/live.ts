import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { LiveEvent } from '@brew/shared';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import { sessions } from '../db/schema';
import { requireUser } from '../plugins/auth';
import { streamTab } from '../live/hub';

const event = (e: LiveEvent) => `data: ${JSON.stringify(e)}\n\n`;

/** GET /api/events: Server-Sent Events stream of live-refresh hints. */
export async function liveRoutes(app: FastifyInstance, { db, config }: { db: Db; config: AppConfig }) {
  app.get('/api/events', async (req, reply) => {
    const { user, session } = requireUser(req);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Stop nginx and similar proxies from buffering the stream.
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
    });
    res.write(`retry: 5000\n\n${event({ kind: 'hello' })}`);

    let open = true;
    const client = {
      userId: user.id,
      tab: streamTab(req),
      send: (data: string) => open && res.write(data),
      end: () => close(),
    };
    // Heartbeat keeps proxies from closing an idle stream, and ends it once the session is gone.
    const heartbeat = setInterval(() => {
      const row = db.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.id, session.id)).get();
      if (!row || row.expiresAt.getTime() <= Date.now()) close();
      else res.write(': ping\n\n');
    }, config.liveHeartbeatMs);
    heartbeat.unref();

    function close() {
      if (!open) return;
      open = false;
      clearInterval(heartbeat);
      app.live.remove(client);
      res.end();
    }
    req.raw.on('close', close);
    app.live.add(client);
  });
}

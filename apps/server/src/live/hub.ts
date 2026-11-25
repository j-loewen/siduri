import type { FastifyRequest } from 'fastify';
import { TAB_HEADER, type LiveArea, type LiveEvent } from '@brew/shared';

interface Client {
  userId: string;
  /** Browser tab of this stream; that tab is not sent events about its own changes. */
  tab: string | undefined;
  send(data: string): void;
  end(): void;
}

/**
 * In-memory fan-out of live events to the open event streams. Brewery data is shared, so most
 * events go to everyone; `me` events only to the user they concern.
 */
export class LiveHub {
  private clients = new Set<Client>();

  add(client: Client) {
    this.clients.add(client);
  }

  remove(client: Client) {
    this.clients.delete(client);
  }

  publish(event: LiveEvent, opts: { originTab?: string; userId?: string } = {}) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      if (opts.userId && client.userId !== opts.userId) continue;
      if (opts.originTab && client.tab === opts.originTab) continue;
      client.send(data);
    }
  }

  /** Number of open streams (for tests and logs). */
  get size() {
    return this.clients.size;
  }

  closeAll() {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}

const tabOf = (value: unknown) => (typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : undefined);
export const originTab = (req: FastifyRequest) => tabOf(req.headers[TAB_HEADER]);
export const streamTab = (req: FastifyRequest) => tabOf((req.query as { tab?: unknown } | undefined)?.tab);

/** Tell every open app that something in an area changed, except the tab that made the change. */
export function publishChange(req: FastifyRequest, area: LiveArea, id?: string) {
  req.server.live.publish({ kind: 'changed', area, ...(id && { id }) }, { originTab: originTab(req) });
}

/** Tell a user's other tabs and devices that their account (preferences) changed. */
export function publishMe(req: FastifyRequest, userId: string) {
  req.server.live.publish({ kind: 'me' }, { originTab: originTab(req), userId });
}

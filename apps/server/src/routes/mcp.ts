import type { FastifyInstance, FastifyRequest } from 'fastify';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { MCP_PATH } from '@brew/shared';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import { forbidden, HttpError, unauthorized } from '../lib/errors';
import { createMcpServer } from '../mcp/server';
import { authenticateToken } from '../services/tokens';

/** Reported to MCP clients; bump when tools change in a way clients should notice. */
const MCP_SERVER_VERSION = '1.0.0';

/**
 * The MCP server (Streamable HTTP, stateless): Claude Code, Claude Desktop and other MCP clients
 * call tools here. Authenticated only by an access token (Settings → Claude / MCP), never by the
 * session cookie, so it needs no CSRF header. The token's level decides which tools it gets.
 */
export async function mcpRoutes(app: FastifyInstance, { db, config }: { db: Db; config: AppConfig }) {
  const allowedOrigin = config.baseUrl ? new URL(config.baseUrl).origin : null;

  const authenticate = (req: FastifyRequest) => {
    // MCP clients don't send an Origin; a browser page on another site would (DNS rebinding).
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) throw forbidden('Origin not allowed');
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const found = scheme?.toLowerCase() === 'bearer' && token ? authenticateToken(db, token.trim()) : null;
    if (!found) throw unauthorized('Send an access token: Authorization: Bearer siduri_…');
    return found;
  };

  app.post(MCP_PATH, { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    let auth;
    try {
      auth = authenticate(req);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 401) reply.header('WWW-Authenticate', 'Bearer');
      throw err;
    }

    const server = createMcpServer({ db, user: auth.user, tokenName: auth.token.name, level: auth.token.level, log: req.log, live: app.live }, MCP_SERVER_VERSION);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(', '));
      }
      const request = new Request(new URL(req.url, 'http://localhost'), { method: 'POST', headers, body: JSON.stringify(req.body ?? null) });
      const response = await transport.handleRequest(request, { parsedBody: req.body });
      reply.code(response.status);
      response.headers.forEach((value, name) => {
        if (name !== 'content-length') reply.header(name, value);
      });
      const body = await response.text();
      return reply.send(body || undefined);
    } finally {
      await transport.close();
      await server.close();
    }
  });

  // Stateless: no server-to-client stream and no sessions to end.
  const notAllowed = { error: 'method_not_allowed', message: 'Use POST' };
  app.get(MCP_PATH, async (_req, reply) => reply.code(405).header('Allow', 'POST').send(notAllowed));
  app.delete(MCP_PATH, async (_req, reply) => reply.code(405).header('Allow', 'POST').send(notAllowed));
}

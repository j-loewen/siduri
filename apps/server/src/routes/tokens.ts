import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import { requireUser } from '../plugins/auth';
import { createToken, deleteToken, listTokens, updateToken } from '../services/tokens';

type IdParams = { Params: { id: string } };

/** The signed-in user's MCP access tokens (Settings → Claude / MCP). */
export async function tokenRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/tokens', async (req) => listTokens(db, requireUser(req).user.id));

  app.post('/api/tokens', async (req, reply) => reply.code(201).send(createToken(db, requireUser(req).user.id, req.body)));

  app.patch<IdParams>('/api/tokens/:id', async (req) => updateToken(db, requireUser(req).user.id, req.params.id, req.body));

  app.delete<IdParams>('/api/tokens/:id', async (req, reply) => {
    deleteToken(db, requireUser(req).user.id, req.params.id);
    return reply.code(204).send();
  });
}

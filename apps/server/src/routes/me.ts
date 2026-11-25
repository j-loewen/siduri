import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { changePasswordSchema, updatePrefsSchema, updateProfileSchema } from '@brew/shared';
import type { Db } from '../db';
import { users } from '../db/schema';
import { verifyPassword } from '../auth/password';
import { deleteUserSessions } from '../auth/sessions';
import { badRequest, parse } from '../lib/errors';
import { requireUser } from '../plugins/auth';
import { publishMe } from '../live/hub';
import { changePassword, toUserDto, updatePrefs } from '../services/users';

export async function meRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/me', async (req) => toUserDto(requireUser(req).user));

  app.patch('/api/me/prefs', async (req) => {
    const { user } = requireUser(req);
    const updated = toUserDto(updatePrefs(db, user, parse(updatePrefsSchema, req.body)));
    // Theme, language and units follow on my other devices.
    publishMe(req, user.id);
    return updated;
  });

  app.patch('/api/me/profile', async (req) => {
    const { user } = requireUser(req);
    const { displayName } = parse(updateProfileSchema, req.body);
    const row = db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id)).returning().get();
    publishMe(req, user.id);
    return toUserDto(row);
  });

  app.post('/api/me/password', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { user } = requireUser(req);
    const input = parse(changePasswordSchema, req.body);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw badRequest('Current password is wrong');
    await changePassword(db, user.id, input.newPassword);
    deleteUserSessions(db, user.id, req.sessionToken ?? undefined);
    return reply.code(204).send();
  });
}

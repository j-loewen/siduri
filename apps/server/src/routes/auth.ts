import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema, type AuthStatus } from '@brew/shared';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import { DUMMY_HASH, verifyPassword } from '../auth/password';
import { createSession, deleteSession } from '../auth/sessions';
import { parse, unauthorized } from '../lib/errors';
import { clearSessionCookie, setSessionCookie } from '../plugins/auth';
import { countUsers, findUserByUsername, registerUser, toUserDto } from '../services/users';

const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance, { db, config }: { db: Db; config: AppConfig }) {
  app.get('/api/auth/status', async (): Promise<AuthStatus> => {
    const needsSetup = countUsers(db) === 0;
    return { needsSetup, registrationOpen: needsSetup || config.allowRegistration };
  });

  app.post('/api/auth/register', { config: authRateLimit }, async (req, reply) => {
    const input = parse(registerSchema, req.body);
    const user = await registerUser(db, input, config.allowRegistration);
    const { token, expiresAt } = createSession(db, user.id, config.sessionDays, req.headers['user-agent']);
    setSessionCookie(reply, config, token, expiresAt);
    return reply.code(201).send(toUserDto(user));
  });

  app.post('/api/auth/login', { config: authRateLimit }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const user = findUserByUsername(db, input.username);
    // Same timing whether or not the user exists.
    const ok = await verifyPassword(user?.passwordHash || DUMMY_HASH, input.password);
    if (!user || !ok) throw unauthorized('Wrong username or password');
    const { token, expiresAt } = createSession(db, user.id, config.sessionDays, req.headers['user-agent']);
    setSessionCookie(reply, config, token, expiresAt);
    return toUserDto(user);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });
}

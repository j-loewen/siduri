import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { Db } from '../db';
import { sessions, users, type SessionRow, type UserRow } from '../db/schema';

export const SESSION_COOKIE = 'brew_sid';
const DAY = 24 * 60 * 60 * 1000;

const tokenId = (token: string) => createHash('sha256').update(token).digest('base64url');

export function createSession(db: Db, userId: string, days: number, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * DAY);
  db.insert(sessions)
    .values({ id: tokenId(token), userId, expiresAt, userAgent: userAgent?.slice(0, 256) })
    .run();
  return { token, expiresAt };
}

export interface ActiveSession {
  session: SessionRow;
  user: UserRow;
  /** Set when the expiry was extended and the cookie should be re-sent. */
  renewedUntil?: Date;
}

/** Look up a session by cookie token; extends it (sliding expiry) once half its lifetime is used. */
export function getSession(db: Db, token: string, days: number): ActiveSession | null {
  const id = tokenId(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  if (row.session.expiresAt.getTime() - now < (days * DAY) / 2) {
    const renewedUntil = new Date(now + days * DAY);
    db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id)).run();
    return { ...row, session: { ...row.session, expiresAt: renewedUntil }, renewedUntil };
  }
  return row;
}

export const deleteSession = (db: Db, token: string) =>
  db.delete(sessions).where(eq(sessions.id, tokenId(token))).run();

/** Log a user out everywhere, optionally keeping the current session. */
export function deleteUserSessions(db: Db, userId: string, exceptToken?: string) {
  const where = exceptToken
    ? and(eq(sessions.userId, userId), ne(sessions.id, tokenId(exceptToken)))
    : eq(sessions.userId, userId);
  db.delete(sessions).where(where).run();
}

export const purgeExpiredSessions = (db: Db) =>
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();

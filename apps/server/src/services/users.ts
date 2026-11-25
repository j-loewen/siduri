import { count, eq, sql } from 'drizzle-orm';
import { resolvePrefs, type RegisterInput, type UpdatePrefsInput, type UserDto } from '@brew/shared';
import type { Db } from '../db';
import { users, type UserRow } from '../db/schema';
import { hashPassword } from '../auth/password';
import { conflict, forbidden } from '../lib/errors';

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    prefs: resolvePrefs(row.prefs),
    createdAt: row.createdAt.toISOString(),
  };
}

export const countUsers = (db: Db) => db.select({ n: count() }).from(users).get()?.n ?? 0;

export const findUserByUsername = (db: Db, username: string) =>
  db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .get();

/**
 * Sign-up. The first account becomes the admin; after that, only when ALLOW_REGISTRATION is on.
 * Count + insert run in one transaction so two simultaneous first sign-ups cannot both win.
 */
export async function registerUser(db: Db, input: RegisterInput, allowRegistration: boolean) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(
    (tx) => {
      const t = tx as unknown as Db;
      const isFirst = countUsers(t) === 0;
      if (!isFirst && !allowRegistration) throw forbidden('Registration is disabled');
      if (findUserByUsername(t, input.username)) throw conflict('Username is already taken');
      return t
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          username: input.username,
          displayName: input.displayName || input.username,
          passwordHash,
          role: isFirst ? 'admin' : 'user',
        })
        .returning()
        .get();
    },
    { behavior: 'immediate' },
  );
}

export function updatePrefs(db: Db, user: UserRow, patch: UpdatePrefsInput) {
  const prefs = { ...user.prefs, ...patch, ...(patch.units && { units: { ...user.prefs.units, ...patch.units } }) };
  return db.update(users).set({ prefs, updatedAt: new Date() }).where(eq(users.id, user.id)).returning().get();
}

export async function changePassword(db: Db, userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId)).run();
}

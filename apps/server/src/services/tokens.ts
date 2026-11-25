import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { createTokenSchema, TOKEN_PREFIX, updateTokenSchema, type ApiTokenDto, type CreatedTokenDto } from '@brew/shared';
import type { Db } from '../db';
import { apiTokens, users, type ApiTokenRow, type UserRow } from '../db/schema';
import { notFound, parse } from '../lib/errors';

/** Tokens are stored by their SHA-256 (like sessions): a leaked database does not leak tokens. */
const tokenId = (token: string) => createHash('sha256').update(token).digest('base64url');

/** "Last used" is written at most this often, so busy assistants don't write on every call. */
const TOUCH_EVERY_MS = 60_000;

export function toTokenDto(row: ApiTokenRow): ApiTokenDto {
  return { id: row.id, name: row.name, level: row.level, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
}

/** The signed-in user's tokens (tokens are personal; the brewery data they reach is shared). */
export function listTokens(db: Db, userId: string): ApiTokenDto[] {
  return db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(asc(apiTokens.createdAt)).all().map(toTokenDto);
}

export function createToken(db: Db, userId: string, raw: unknown): CreatedTokenDto {
  const input = parse(createTokenSchema, raw);
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const row = db.insert(apiTokens).values({ id: tokenId(token), userId, name: input.name, level: input.level }).returning().get();
  return { ...toTokenDto(row), token };
}

function ownRow(db: Db, userId: string, id: string): ApiTokenRow {
  const row = db.select().from(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId))).get();
  if (!row) throw notFound('Token not found');
  return row;
}

export function updateToken(db: Db, userId: string, id: string, raw: unknown): ApiTokenDto {
  const patch = parse(updateTokenSchema, raw);
  ownRow(db, userId, id);
  return toTokenDto(db.update(apiTokens).set(patch).where(eq(apiTokens.id, id)).returning().get());
}

export function deleteToken(db: Db, userId: string, id: string) {
  ownRow(db, userId, id);
  db.delete(apiTokens).where(eq(apiTokens.id, id)).run();
}

/** The token and its user for a bearer token, or null. Notes when it was used. */
export function authenticateToken(db: Db, token: string): { token: ApiTokenRow; user: UserRow } | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = db.select({ token: apiTokens, user: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(eq(apiTokens.id, tokenId(token))).get();
  if (!row) return null;
  const now = new Date();
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id)).run();
    row.token.lastUsedAt = now;
  }
  return row;
}

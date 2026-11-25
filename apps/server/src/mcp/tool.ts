import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { LiveArea, TokenLevel } from '@brew/shared';
import type { Db } from '../db';
import type { UserRow } from '../db/schema';
import type { LiveHub } from '../live/hub';

/** What a tool runs with: the database, the caller and how to tell open browser tabs about changes. */
export interface ToolContext {
  db: Db;
  user: UserRow;
  /** Name of the access token (shown in batch logs: "changed via Claude Code"). */
  tokenName: string;
  level: TokenLevel;
  log: FastifyBaseLogger;
  live: LiveHub;
}

/** Tell open browser tabs that something changed (as the REST routes do). */
export const changed = (ctx: ToolContext, area: LiveArea, id?: string) => ctx.live.publish({ kind: 'changed', area, ...(id && { id }) });

/**
 * One MCP tool: a thin layer over a service. `level` is the least token level that gets it.
 * Results are returned to the assistant as JSON.
 */
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  level: TokenLevel;
  title: string;
  description: string;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => unknown;
}

/** Keeps the argument types of each tool while collecting them in one list. */
export const tool = <S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef => def as unknown as ToolDef;

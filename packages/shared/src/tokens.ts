import { z } from 'zod';

/**
 * Access tokens for the MCP server (Claude and other AI assistants). Each token has a level that
 * decides which tools it gets; the level can be changed later in the settings.
 */
export const TOKEN_LEVELS = ['read', 'write', 'full'] as const;
export type TokenLevel = (typeof TOKEN_LEVELS)[number];

/** Whether a token of `level` may use a tool of `required` level. */
export const tokenAllows = (level: TokenLevel, required: TokenLevel) => TOKEN_LEVELS.indexOf(level) >= TOKEN_LEVELS.indexOf(required);

/** Path of the MCP endpoint (Streamable HTTP). */
export const MCP_PATH = '/mcp';
/** Every token starts with this, so it is recognisable (e.g. by secret scanners). */
export const TOKEN_PREFIX = 'siduri_';

const tokenFields = {
  name: z.string().trim().min(1).max(80),
  level: z.enum(TOKEN_LEVELS),
};

export const createTokenSchema = z.object({
  name: tokenFields.name,
  level: tokenFields.level.default('write'),
});
export type CreateTokenInput = z.input<typeof createTokenSchema>;

/** No defaults: see users.ts. */
export const updateTokenSchema = z.object(tokenFields).partial();
export type UpdateTokenInput = z.infer<typeof updateTokenSchema>;

export interface ApiTokenDto {
  id: string;
  name: string;
  level: TokenLevel;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Returned once, when the token is created: the secret is not stored and cannot be shown again. */
export interface CreatedTokenDto extends ApiTokenDto {
  token: string;
}

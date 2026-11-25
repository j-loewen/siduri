import { z } from 'zod';

/** Header every mutating request must carry (CSRF defence together with SameSite cookies). */
export const CSRF_HEADER = 'x-brew-client';
export const CSRF_HEADER_VALUE = '1';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, digits, dot, dash and underscore');

export const passwordSchema = z.string().min(8, 'At least 8 characters').max(256, 'At most 256 characters');

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthStatus {
  /** True when no account exists yet: the next registration becomes admin. */
  needsSetup: boolean;
  /** True when the sign-up page may be used right now. */
  registrationOpen: boolean;
}

import { z } from 'zod';
import { METRIC_UNITS, MEASURES, type Measure, type UnitPrefs } from './units';

export const ROLES = ['admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

const unitPrefsSchema = z
  .object(Object.fromEntries(Object.keys(MEASURES).map((k) => [k, z.string().max(16)])) as Record<Measure, z.ZodString>)
  .partial();

const prefFields = {
  theme: z.enum(THEMES),
  /** UI language; "auto" follows the browser. */
  language: z.string().max(16),
  /** Preferred display unit per kind of value; missing entries use metric. */
  units: unitPrefsSchema,
};

export const userPrefsSchema = z.object({
  theme: prefFields.theme.default('system'),
  language: prefFields.language.default('auto'),
  units: prefFields.units.default({}),
});
export interface UserPrefs {
  theme: Theme;
  language: string;
  units: UnitPrefs;
}

export function resolvePrefs(raw: Partial<z.infer<typeof userPrefsSchema>> | undefined): UserPrefs {
  const p = userPrefsSchema.parse(raw ?? {});
  return { ...p, units: { ...METRIC_UNITS, ...p.units } };
}
export const DEFAULT_PREFS: UserPrefs = resolvePrefs({});

// Built from the fields without defaults: zod 4 fills defaults into missing keys even after
// .partial(), so a patch of one preference would reset the others.
export const updatePrefsSchema = z.object(prefFields).partial();
export type UpdatePrefsInput = z.infer<typeof updatePrefsSchema>;

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: UserPrefs;
  createdAt: string;
}

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'At least 8 characters').max(256),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
});

export interface ApiError {
  /** Stable machine-readable code; the web app translates it. */
  error: string;
  message: string;
  details?: unknown;
}

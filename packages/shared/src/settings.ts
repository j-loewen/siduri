import { z } from 'zod';

const settingsFields = {
  breweryName: z.string().trim().max(80),
  /** Logo of the brewery (id from POST /api/images). */
  breweryLogo: z.string().max(64).nullable(),
  /** Equipment profile new recipes start with. */
  defaultEquipmentId: z.string().max(64).nullable(),
  /** Water profile you brew with (used by water calculations). */
  defaultSourceWaterId: z.string().max(64).nullable(),
};

/** Settings of the brewery, shared by everyone who signs in. */
export const appSettingsSchema = z.object({
  breweryName: settingsFields.breweryName.default(''),
  breweryLogo: settingsFields.breweryLogo.default(null),
  defaultEquipmentId: settingsFields.defaultEquipmentId.default(null),
  defaultSourceWaterId: settingsFields.defaultSourceWaterId.default(null),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

// Built from the fields without defaults: zod 4 fills defaults into missing keys even after
// .partial(), so a patch of one setting would reset the others.
export const updateAppSettingsSchema = z.object(settingsFields).partial();

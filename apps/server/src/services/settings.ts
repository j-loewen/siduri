import { eq } from 'drizzle-orm';
import { appSettingsSchema, type AppSettings } from '@brew/shared';
import type { Db } from '../db';
import { appSettings } from '../db/schema';

export function getSettings(db: Db): AppSettings {
  const row = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  return appSettingsSchema.parse(row?.data ?? {});
}

export function updateSettings(db: Db, patch: Partial<AppSettings>): AppSettings {
  const data = appSettingsSchema.parse({ ...getSettings(db), ...patch });
  db.insert(appSettings)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: appSettings.id, set: { data, updatedAt: new Date() } })
    .run();
  return data;
}

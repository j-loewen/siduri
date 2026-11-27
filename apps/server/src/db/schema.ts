import { sql } from 'drizzle-orm';
import { blob, index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type {
  AppSettings,
  BatchCarbonation,
  BatchMeasured,
  BatchStatus,
  BrewDayState,
  InventoryKind,
  AmountKind,
  VesselKind,
  DeviceType,
  DevicePayloadDto,
  Telemetry,
  ImageType,
  EquipmentData,
  LibraryKind,
  LibrarySource,
  RecipeDoc,
  RecipeType,
  Role,
  TokenLevel,
  TrashKind,
  UpdatePrefsInput,
} from '@brew/shared';

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now);
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now);

/** Everyone who can sign in. All brewery data is shared between them. */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<Role>().notNull().default('user'),
    prefs: text('prefs', { mode: 'json' }).$type<UpdatePrefsInput>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the cookie token; the raw token is never stored. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Brewery-wide settings: a single row (id 1). */
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Partial<AppSettings>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/**
 * The ingredient library: one row per fermentable, hop, culture, other ingredient, water
 * profile or style. `data` holds the kind's fields (validated by the zod schema of that kind).
 */
export const libraryItems = sqliteTable(
  'library_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<LibraryKind>().notNull(),
    name: text('name').notNull(),
    source: text('source').$type<LibrarySource>().notNull(),
    /** Set for items from the bundled library (see @brew/seed-data). */
    seedKey: text('seed_key'),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('library_kind_name_idx').on(t.kind, t.name), uniqueIndex('library_seed_key_uq').on(t.seedKey)],
);

/**
 * Seed items that were ever added. Deleted seed items stay listed here, so a later seed update
 * does not bring them back.
 */
export const seedKeys = sqliteTable('seed_keys', {
  seedKey: text('seed_key').primaryKey(),
  addedAt: createdAt(),
});

export const equipmentProfiles = sqliteTable('equipment_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).$type<EquipmentData>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    styleName: text('style_name'),
    /** The recipe picture (copied from the document, for lists). */
    imageId: text('image_id'),
    type: text('type').$type<RecipeType>().notNull(),
    doc: text('doc', { mode: 'json' }).$type<RecipeDoc>().notNull(),
    // Calculated from the document on every save, for lists and sorting.
    og: real('og').notNull(),
    fg: real('fg').notNull(),
    abvPct: real('abv_pct').notNull(),
    ibu: real('ibu').notNull(),
    colorEbc: real('color_ebc').notNull(),
    batchSizeL: real('batch_size_l').notNull(),
    /** Bumped by every save (optimistic concurrency). */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('recipes_name_idx').on(t.name), index('recipes_updated_idx').on(t.updatedAt)],
);

/** One brew of a recipe, with its own copy of the recipe document. */
export const batches = sqliteTable(
  'batches',
  {
    id: text('id').primaryKey(),
    /** Running number shown as #12. */
    number: integer('number').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<BatchStatus>().notNull().default('planned'),
    /** The recipe it was copied from; kept when the recipe is deleted (set to null). */
    recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    /** Fermenter or keg it is in. */
    vesselId: text('vessel_id').references((): AnySQLiteColumn => vessels.id, { onDelete: 'set null' }),
    /** When its ingredients were taken from the inventory (null: not, or undone). */
    inventoryDeductedAt: integer('inventory_deducted_at', { mode: 'timestamp_ms' }),
    doc: text('doc', { mode: 'json' }).$type<RecipeDoc>().notNull(),
    version: integer('version').notNull().default(1),
    /** YYYY-MM-DD */
    brewDate: text('brew_date'),
    measured: text('measured', { mode: 'json' }).$type<Partial<BatchMeasured>>().notNull().default({}),
    /** How it gets carbonated when packaged. */
    carbonation: text('carbonation', { mode: 'json' }).$type<Partial<BatchCarbonation>>().notNull().default({}),
    brewday: text('brewday', { mode: 'json' }).$type<Partial<BrewDayState>>().notNull().default({}),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('batches_number_uq').on(t.number), index('batches_status_idx').on(t.status), index('batches_recipe_idx').on(t.recipeId)],
);

/** Gravity / temperature readings during fermentation (typed in, or from a device). */
export const batchReadings = sqliteTable(
  'batch_readings',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
    gravity: real('gravity'),
    tempC: real('temp_c'),
    note: text('note').notNull().default(''),
    source: text('source').$type<'manual' | 'device'>().notNull().default('manual'),
    deviceId: text('device_id'),
  },
  (t) => [index('batch_readings_batch_time_idx').on(t.batchId, t.takenAt)],
);

/** Notes and events (brew day started, status changes, …) of a batch. */
export const batchLog = sqliteTable(
  'batch_log',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    kind: text('kind').$type<'note' | 'event'>().notNull(),
    text: text('text').notNull(),
  },
  (t) => [index('batch_log_batch_time_idx').on(t.batchId, t.at)],
);

/** Fermenters, kegs and other vessels. */
export const vessels = sqliteTable('vessels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<VesselKind>().notNull(),
  capacityL: real('capacity_l'),
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Ingredients in stock (one row per lot). Amounts canonical: kg, L or a count. */
export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<InventoryKind>().notNull(),
    libraryRef: text('library_ref'),
    name: text('name').notNull(),
    producer: text('producer').notNull().default(''),
    amountKind: text('amount_kind').$type<AmountKind>().notNull(),
    amount: real('amount').notNull().default(0),
    minAmount: real('min_amount'),
    lot: text('lot').notNull().default(''),
    /** YYYY-MM-DD */
    bestBefore: text('best_before'),
    location: text('location').notNull().default(''),
    unitCost: real('unit_cost'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('inventory_kind_name_idx').on(t.kind, t.name), index('inventory_library_idx').on(t.libraryRef)],
);

/** Every change of an inventory amount. Brew-day deductions can be undone. */
export const inventoryTx = sqliteTable(
  'inventory_tx',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    batchId: text('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    delta: real('delta').notNull(),
    reason: text('reason').$type<'purchase' | 'adjust' | 'brewday' | 'undo'>().notNull(),
    note: text('note').notNull().default(''),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    /** Set on brew-day deductions that were undone. */
    undoneAt: integer('undone_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('inventory_tx_item_idx').on(t.itemId, t.at), index('inventory_tx_batch_idx').on(t.batchId)],
);

/** Smart devices (RAPT Pill, controllers, iSpindel, …). */
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<DeviceType>().notNull(),
    externalId: text('external_id'),
    /** Secret in the push URL. */
    token: text('token').notNull(),
    vesselId: text('vessel_id').references(() => vessels.id, { onDelete: 'set null' }),
    batchId: text('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    lastTelemetry: text('last_telemetry', { mode: 'json' }).$type<Telemetry>(),
    /** The last few messages (newest first), for checking the setup. */
    recent: text('recent', { mode: 'json' }).$type<DevicePayloadDto[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('devices_token_uq').on(t.token), index('devices_external_idx').on(t.externalId)],
);

/** Settings of outside services (e.g. the RAPT data stream key). */
export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/** Pictures (recipe logos), stored in the database so a backup is still one file. */
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  type: text('type').$type<ImageType>().notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: createdAt(),
});

/** Access tokens for the MCP server (Claude). Only a hash of the token is stored. */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    /** SHA-256 of the token; the raw token is shown once and never stored. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    level: text('level').$type<TokenLevel>().notNull(),
    createdAt: createdAt(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('api_tokens_user_idx').on(t.userId)],
);

/**
 * Deleted records, kept until the brewery's `trashDays` have passed. `data` is a snapshot of the
 * record with what was deleted along with it (readings, log, transactions) and the links other
 * records lost (see services/trash.ts); restoring puts it all back under the same ids.
 */
export const trash = sqliteTable(
  'trash',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<TrashKind>().notNull(),
    itemId: text('item_id').notNull(),
    name: text('name').notNull(),
    detail: text('detail').notNull().default(''),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (t) => [index('trash_deleted_idx').on(t.deletedAt), index('trash_kind_idx').on(t.kind)],
);

export type UserRow = typeof users.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type LibraryRow = typeof libraryItems.$inferSelect;
export type EquipmentRow = typeof equipmentProfiles.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type ReadingRow = typeof batchReadings.$inferSelect;
export type LogRow = typeof batchLog.$inferSelect;
export type VesselRow = typeof vessels.$inferSelect;
export type InventoryRow = typeof inventoryItems.$inferSelect;
export type InventoryTxRow = typeof inventoryTx.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;

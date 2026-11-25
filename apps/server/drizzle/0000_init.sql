CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batch_log` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batch_log_batch_time_idx` ON `batch_log` (`batch_id`,`at`);--> statement-breakpoint
CREATE TABLE `batch_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`gravity` real,
	`temp_c` real,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`device_id` text,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batch_readings_batch_time_idx` ON `batch_readings` (`batch_id`,`taken_at`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`recipe_id` text,
	`vessel_id` text,
	`inventory_deducted_at` integer,
	`doc` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`brew_date` text,
	`measured` text DEFAULT '{}' NOT NULL,
	`carbonation` text DEFAULT '{}' NOT NULL,
	`brewday` text DEFAULT '{}' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vessel_id`) REFERENCES `vessels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_number_uq` ON `batches` (`number`);--> statement-breakpoint
CREATE INDEX `batches_status_idx` ON `batches` (`status`);--> statement-breakpoint
CREATE INDEX `batches_recipe_idx` ON `batches` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`external_id` text,
	`token` text NOT NULL,
	`vessel_id` text,
	`batch_id` text,
	`last_seen_at` integer,
	`last_telemetry` text,
	`recent` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`vessel_id`) REFERENCES `vessels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_uq` ON `devices` (`token`);--> statement-breakpoint
CREATE INDEX `devices_external_idx` ON `devices` (`external_id`);--> statement-breakpoint
CREATE TABLE `equipment_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` blob NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`library_ref` text,
	`name` text NOT NULL,
	`producer` text DEFAULT '' NOT NULL,
	`amount_kind` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`min_amount` real,
	`lot` text DEFAULT '' NOT NULL,
	`best_before` text,
	`location` text DEFAULT '' NOT NULL,
	`unit_cost` real,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_kind_name_idx` ON `inventory_items` (`kind`,`name`);--> statement-breakpoint
CREATE INDEX `inventory_library_idx` ON `inventory_items` (`library_ref`);--> statement-breakpoint
CREATE TABLE `inventory_tx` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`batch_id` text,
	`delta` real NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`at` integer NOT NULL,
	`undone_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inventory_tx_item_idx` ON `inventory_tx` (`item_id`,`at`);--> statement-breakpoint
CREATE INDEX `inventory_tx_batch_idx` ON `inventory_tx` (`batch_id`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`seed_key` text,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_kind_name_idx` ON `library_items` (`kind`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `library_seed_key_uq` ON `library_items` (`seed_key`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`style_name` text,
	`image_id` text,
	`type` text NOT NULL,
	`doc` text NOT NULL,
	`og` real NOT NULL,
	`fg` real NOT NULL,
	`abv_pct` real NOT NULL,
	`ibu` real NOT NULL,
	`color_ebc` real NOT NULL,
	`batch_size_l` real NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipes_name_idx` ON `recipes` (`name`);--> statement-breakpoint
CREATE INDEX `recipes_updated_idx` ON `recipes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `seed_keys` (
	`seed_key` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower_uq` ON `users` (lower("username"));--> statement-breakpoint
CREATE TABLE `vessels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`capacity_l` real,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);

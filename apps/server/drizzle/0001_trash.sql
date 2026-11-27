CREATE TABLE `trash` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`name` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`deleted_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trash_deleted_idx` ON `trash` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `trash_kind_idx` ON `trash` (`kind`);
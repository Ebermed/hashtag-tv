CREATE TABLE `channel_playout` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`current_media_item_id` integer,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ends_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_commercial_at` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`current_media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `channel_settings` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`shuffle_enabled` integer DEFAULT true NOT NULL,
	`commercials_enabled` integer DEFAULT false NOT NULL,
	`commercial_interval_minutes` integer DEFAULT 30 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`youtube_id` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playout_queue_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`media_item_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `media_items` ADD `source_type` text DEFAULT 'youtube' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_items` ADD `storage_key` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `file_size` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_channel_media_unique` ON `playlist_items` (`channel_id`,`media_item_id`);
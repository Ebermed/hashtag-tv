ALTER TABLE `channel_settings` ADD `enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
INSERT INTO `channel_settings` (`channel_id`, `enabled`, `shuffle_enabled`, `commercials_enabled`, `commercial_interval_minutes`, `updated_at`) VALUES
  ('tv', 1, 1, 0, 30, CURRENT_TIMESTAMP),
  ('rock', 0, 1, 0, 30, CURRENT_TIMESTAMP),
  ('pop', 0, 1, 0, 30, CURRENT_TIMESTAMP),
  ('perreo', 0, 1, 0, 30, CURRENT_TIMESTAMP),
  ('kpop', 0, 1, 0, 30, CURRENT_TIMESTAMP),
  ('byrequest', 1, 1, 0, 30, CURRENT_TIMESTAMP)
ON CONFLICT (`channel_id`) DO UPDATE SET
  `enabled` = excluded.`enabled`,
  `updated_at` = excluded.`updated_at`;

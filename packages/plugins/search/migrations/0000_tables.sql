CREATE TABLE `search_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`extractor_version` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_source_idx` ON `search_documents` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `search_reindex_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`cursor_type` text NOT NULL,
	`cursor_id` integer DEFAULT 0 NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);

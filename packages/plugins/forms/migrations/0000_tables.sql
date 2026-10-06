CREATE TABLE `form_label_snapshots` (
	`digest` text PRIMARY KEY NOT NULL,
	`labels` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`bound_type` text,
	`bound_id` integer,
	`ip_hash` text,
	`user_agent` text,
	`labels_digest` text NOT NULL,
	`handler_error` text,
	`note` text,
	`answers` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `form_submissions_form_idx` ON `form_submissions` (`form`);--> statement-breakpoint
CREATE INDEX `form_submissions_form_status_idx` ON `form_submissions` (`form`,`status`);--> statement-breakpoint
CREATE INDEX `form_submissions_status_idx` ON `form_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `form_submissions_bound_idx` ON `form_submissions` (`bound_type`,`bound_id`) WHERE "form_submissions"."bound_id" is not null;
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL,
	`event` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_label` text NOT NULL,
	`actor_id` integer,
	`actor_label` text,
	`properties` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_occurred_at_idx` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_subject_idx` ON `audit_log` (`subject_type`,`subject_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_event_idx` ON `audit_log` (`event`,`occurred_at`);
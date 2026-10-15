CREATE TABLE `email_code_misses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_id` integer NOT NULL,
	FOREIGN KEY (`code_id`) REFERENCES `email_codes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_code_misses_code_idx` ON `email_code_misses` (`code_id`);--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_codes_email_created_idx` ON `email_codes` (`email`,`created_at`);
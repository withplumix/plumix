CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`parent_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`author_user_id` integer,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`body_md` text NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_entry_status_created_idx` ON `comments` (`entry_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_id_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE INDEX `comments_status_created_idx` ON `comments` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_author_email_idx` ON `comments` (`author_email`);--> statement-breakpoint
CREATE INDEX `comments_author_user_id_idx` ON `comments` (`author_user_id`);
CREATE TABLE `edit_leases` (
	`resource_kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`surface` text NOT NULL,
	`since` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`resource_kind`, `resource_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `edit_leases_user_id_idx` ON `edit_leases` (`user_id`);
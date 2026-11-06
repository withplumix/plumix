CREATE TABLE `oauth_authorization_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`resource` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_authorization_codes_user_id_idx` ON `oauth_authorization_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_user_id_client_id_idx` ON `oauth_grants` (`user_id`,`client_id`);
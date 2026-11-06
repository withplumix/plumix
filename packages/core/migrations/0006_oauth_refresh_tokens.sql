CREATE TABLE `oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` integer NOT NULL,
	`resource` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer NOT NULL,
	`rotated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_grant_id_idx` ON `oauth_refresh_tokens` (`grant_id`);
CREATE TABLE `seo_noindexed_entries` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);

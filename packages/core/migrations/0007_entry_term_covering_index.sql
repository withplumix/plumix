DROP INDEX `entry_term_term_id_idx`;--> statement-breakpoint
CREATE INDEX `entry_term_term_id_idx` ON `entry_term` (`term_id`,`entry_id`);
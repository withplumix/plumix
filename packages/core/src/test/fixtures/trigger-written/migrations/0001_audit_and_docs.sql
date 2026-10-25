-- A trigger that writes with `INSERT OR IGNORE`, and a plain table whose name
-- starts with a full-text table's.
CREATE TABLE audit (thing_id INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE things (id INTEGER PRIMARY KEY);
--> statement-breakpoint
CREATE TRIGGER things_deleted AFTER DELETE ON things
  BEGIN
    INSERT OR IGNORE INTO audit (thing_id) VALUES (old.id);
  END;
--> statement-breakpoint
CREATE VIRTUAL TABLE docs USING fts5(body, content='');
--> statement-breakpoint
CREATE TABLE docs_log (note TEXT NOT NULL);

-- The table a trigger writes into is made before the table the trigger is on,
-- so emptying tables in creation order refills it.
CREATE TABLE note_log (note_id INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER notes_deleted AFTER DELETE ON notes
  BEGIN
    INSERT INTO note_log (note_id) VALUES (old.id);
  END;

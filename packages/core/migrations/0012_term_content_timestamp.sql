UPDATE terms SET updated_at = unixepoch() WHERE updated_at = 0;
--> statement-breakpoint
CREATE TRIGGER terms_initial_timestamp AFTER INSERT ON terms
  WHEN new.updated_at = 0
  BEGIN
    UPDATE terms SET updated_at = unixepoch() WHERE id = new.id;
  END;
--> statement-breakpoint
CREATE TRIGGER terms_content_timestamp AFTER UPDATE ON terms
  WHEN new.updated_at IS old.updated_at
    AND (old.id IS NOT new.id
      OR old.taxonomy IS NOT new.taxonomy
      OR old.name IS NOT new.name
      OR old.slug IS NOT new.slug
      OR old.description IS NOT new.description
      OR old.meta IS NOT new.meta
      OR old.parent_id IS NOT new.parent_id)
  BEGIN
    UPDATE terms SET updated_at = max(unixepoch(), old.updated_at + 1)
      WHERE id = new.id;
  END;

-- Custom SQL migration file, put your code below! --
CREATE TRIGGER entries_change_feed_insert AFTER INSERT ON entries
  WHEN new.type NOT IN ('revision', 'autosave')
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END;
--> statement-breakpoint
CREATE TRIGGER entries_change_feed_update AFTER UPDATE ON entries
  WHEN new.type NOT IN ('revision', 'autosave')
    AND (old.title IS NOT new.title
      OR old.content IS NOT new.content
      OR old.excerpt IS NOT new.excerpt
      OR old.status IS NOT new.status
      OR old.type IS NOT new.type
      OR old.slug IS NOT new.slug
      OR old.parent_id IS NOT new.parent_id
      OR old.meta IS NOT new.meta)
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END;
--> statement-breakpoint
CREATE TRIGGER entries_change_feed_delete AFTER DELETE ON entries
  WHEN old.type NOT IN ('revision', 'autosave')
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (old.id, 'delete');
  END;
